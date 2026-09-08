import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_initial_schema.sql', import.meta.url), 'utf8'));
  db.exec("INSERT INTO families(id,name) VALUES('existing','Existing family')");
  db.exec(readFileSync(new URL('../migrations/0002_household_portal.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0003_family_directory.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0004_chat_requester.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0005_login_identity.sql', import.meta.url), 'utf8'));
  t.after(() => db.close());
  const DB = {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { const result = statement.run(...args); return { meta: { changes: result.changes } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  async function request(path, method = 'GET', body, extra = {}) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { DB, LOCAL_DEV: 'true', ...extra.env });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  return { db, request };
}

test('additive migration preserves existing family records', t => {
  const { db } = fixture(t);
  assert.equal(db.prepare('SELECT name FROM families WHERE id=?').get('existing').name, 'Existing family');
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 7);
});

test('groceries persist across reads, edit by version, and soft-delete', async t => {
  const { request, db } = fixture(t);
  const created = await request('/api/groceries', 'POST', { name: ' Milk ', quantity: '2 cartons', created_by: 'spoofed' });
  assert.equal(created.status, 201);
  const item = created.data.item;
  assert.equal(item.name, 'Milk'); assert.equal(item.done, false); assert.equal(item.created_by, 'local-development');
  const secondClient = await request('/api/groceries');
  assert.equal(secondClient.data.items[0].id, item.id);
  assert.equal(secondClient.headers.get('cache-control'), 'private, no-store');
  const edited = await request(`/api/groceries/${item.id}`, 'PATCH', { ...item, done: true });
  assert.equal(edited.data.item.done, true); assert.equal(edited.data.item.version, 2);
  assert.equal((await request(`/api/groceries/${item.id}`, 'DELETE', { version: 2 })).status, 200);
  assert.equal((await request('/api/groceries')).data.items.length, 0);
  assert.ok(db.prepare('SELECT deleted_at FROM grocery_items WHERE id=?').get(item.id).deleted_at);
});

test('stale edits/deletes cannot overwrite another member or resurrect a removed item', async t => {
  const { request } = fixture(t);
  const { data: { item } } = await request('/api/groceries', 'POST', { name: 'Coffee' });
  assert.equal((await request(`/api/groceries/${item.id}`, 'PATCH', { ...item, quantity: '3 bags' })).status, 200);
  assert.equal((await request(`/api/groceries/${item.id}`, 'PATCH', { ...item, done: true })).status, 409);
  assert.equal((await request(`/api/groceries/${item.id}`, 'DELETE', { version: 1 })).status, 409);
  assert.equal((await request('/api/groceries')).data.items[0].quantity, '3 bags');
  await request(`/api/groceries/${item.id}`, 'DELETE', { version: 2 });
  assert.equal((await request(`/api/groceries/${item.id}`, 'PATCH', { ...item, version: 3 })).status, 409);
});

test('import retries neither duplicate items nor resurrect deleted imports', async t => {
  const { request } = fixture(t);
  const body = { items: [{ legacy_id: 'old-1', name: 'Apples', done: false }, { legacy_id: 'old-2', name: 'Bread', done: true }] };
  assert.equal((await request('/api/groceries/import', 'POST', body)).status, 200);
  await request('/api/groceries/import', 'POST', body);
  let list = (await request('/api/groceries')).data.items;
  assert.equal(list.length, 2);
  await request(`/api/groceries/${list[0].id}`, 'DELETE', { version: list[0].version });
  await request('/api/groceries/import', 'POST', body);
  list = (await request('/api/groceries')).data.items;
  assert.equal(list.length, 1);
});

test('invalid import is rejected without inserting a partial list', async t => {
  const { request } = fixture(t);
  const result = await request('/api/groceries/import', 'POST', { items: [{ legacy_id: '1', name: 'Good' }, { legacy_id: '2', name: '' }] });
  assert.equal(result.status, 400);
  assert.equal((await request('/api/groceries')).data.items.length, 0);
});

test('news can be created, edited, and removed, with a trusted author', async t => {
  const { request } = fixture(t);
  const { data: { item } } = await request('/api/news', 'POST', { title: 'Dinner', body: 'Sunday at home.', author_name: 'Spoofed' });
  assert.equal(item.author_name, 'Local family member');
  assert.equal((await request('/api/news')).data.items.length, 1);
  const edited = await request(`/api/news/${item.id}`, 'PATCH', { ...item, body: 'Saturday instead.' });
  assert.equal(edited.data.item.body, 'Saturday instead.');
  assert.equal((await request(`/api/news/${item.id}`, 'PATCH', item)).status, 409);
  await request(`/api/news/${item.id}`, 'DELETE', { version: 2 });
  assert.equal((await request('/api/news')).data.items.length, 0);
});

test('calendar stores timed events in UTC and all-day events as dates', async t => {
  const { request } = fixture(t);
  const body = { title: 'Dinner', all_day: false, start_at: '2026-10-11T23:00:00.000Z', end_at: '2026-10-12T01:00:00.000Z', timezone: 'America/Chicago', location: 'Home' };
  const created = await request('/api/events', 'POST', body);
  assert.equal(created.status, 201);
  assert.equal(created.data.item.start_at, body.start_at);
  const item = created.data.item;
  const allDay = { ...item, all_day: true, start_at: '2026-12-25', end_at: '2026-12-26' };
  const edited = await request(`/api/events/${item.id}`, 'PATCH', allDay);
  assert.equal(edited.status, 200); assert.equal(edited.data.item.start_at, '2026-12-25');
  assert.equal((await request(`/api/events/${item.id}`, 'PATCH', allDay)).status, 409);
  await request(`/api/events/${item.id}`, 'DELETE', { version: 2 });
  assert.equal((await request('/api/events')).data.items.length, 0);
});

test('calendar rejects impossible dates, wrong types, bad timezone and reversed ranges', async t => {
  const { request } = fixture(t);
  const valid = { title: 'Trip', all_day: true, start_at: '2026-10-20', end_at: null, timezone: 'America/Chicago' };
  for (const changes of [{ start_at: '2026-02-30' }, { end_at: '2026-10-19' }, { timezone: 'invalid/zone' }, { all_day: 'false' }, { title: 4 }, { start_at: 'not a date' }]) {
    assert.equal((await request('/api/events', 'POST', { ...valid, ...changes })).status, 400);
  }
});

test('validation rejects empty names, oversized content, wrong content type, and cross-origin writes', async t => {
  const { request } = fixture(t);
  for (const body of [{ name: ' ' }, { name: 2 }, { name: 'x'.repeat(161) }, { name: 'Tea', quantity: 3 }, { name: 'Tea', done: 'true' }]) assert.equal((await request('/api/groceries', 'POST', body)).status, 400);
  assert.equal((await request('/api/news', 'POST', { title: 'x', body: 'x'.repeat(70000) })).status, 413);
  assert.equal((await request('/api/groceries', 'POST', { name: 'Tea' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request('/api/groceries', 'POST', { name: 'Tea' }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/groceries', 'POST', { name: 'Tea' }, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});

test('API fails closed without Access configuration or a valid token', async t => {
  const { request } = fixture(t);
  assert.equal((await request('/api/me', 'GET', undefined, { env: { LOCAL_DEV: undefined } })).status, 503);
  assert.equal((await request('/api/me', 'GET', undefined, { env: { LOCAL_DEV: undefined, ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com', ACCESS_AUD: 'aud' } })).status, 401);
  const response = await worker.fetch(new Request('https://family.miszuk.com/api/me'), { LOCAL_DEV: 'true' });
  assert.equal(response.status, 503); // Local bypass cannot activate on a deployed hostname.
});

test('unknown endpoints and methods return predictable status codes', async t => {
  const { request } = fixture(t);
  assert.equal((await request('/api/unknown')).status, 404);
  assert.equal((await request('/api/groceries/not-an-id', 'DELETE', { version: 1 })).status, 404);
  assert.equal((await request('/api/news', 'PUT', {})).status, 405);
});

test('requester references support add/edit/null and preserve legacy client updates', async t => {
  const {request}=fixture(t);
  const person=(await request('/api/directory/people','POST',{first_name:'Requester',birth_date:null})).data.item;
  const item=(await request('/api/groceries','POST',{name:'Milk',requester_person_id:person.id})).data.item;
  assert.equal(item.requester_person_id,person.id);
  const changed=await request(`/api/groceries/${item.id}`,'PATCH',{name:'Milk',quantity:'2 gallons',done:true,version:1});
  assert.equal(changed.data.item.requester_person_id,person.id);
  const cleared=await request(`/api/groceries/${item.id}`,'PATCH',{version:2,requester_person_id:null});
  assert.equal(cleared.data.item.requester_person_id,null);
  assert.equal((await request('/api/groceries','POST',{name:'Other'})).data.item.requester_person_id,null);
  assert.equal((await request('/api/groceries','POST',{name:'Bad',requester_person_id:crypto.randomUUID()})).status,400);
});

test('chat sender and Home notice update the same preserved news record', async t => {
  const {request,db}=fixture(t);
  const person=(await request('/api/directory/people','POST',{first_name:'Sender',birth_date:null})).data.item;
  const legacy=(await request('/api/news','POST',{title:'Old headline',body:'Old news body'})).data.item;
  assert.equal(legacy.home_notice,false);assert.equal(legacy.sender_person_id,null);
  const post=(await request('/api/news','POST',{body:'Come to dinner',sender_person_id:person.id,home_notice:true})).data.item;
  assert.equal(post.sender_person_id,person.id);assert.equal(post.home_notice,true);
  const unpinned=await request(`/api/news/${post.id}`,'PATCH',{version:1,home_notice:false});
  assert.equal(unpinned.status,200);assert.equal(unpinned.data.item.body,post.body);assert.equal(unpinned.data.item.sender_person_id,person.id);assert.equal(unpinned.data.item.home_notice,false);
  assert.equal((await request(`/api/news/${post.id}`,'PATCH',{version:1,home_notice:true})).status,409);
  assert.equal(db.prepare('SELECT count(*) n FROM news_posts WHERE deleted_at IS NULL').get().n,2);
  const preserved=(await request('/api/news')).data.items.find(x=>x.id===legacy.id);
  assert.equal(preserved.title,'Old headline');assert.equal(preserved.body,'Old news body');
  assert.equal((await request('/api/news','POST',{body:'Bad',home_notice:'yes'})).status,400);
  assert.equal((await request('/api/news','POST',{body:'Bad',sender_person_id:crypto.randomUUID()})).status,400);
});
