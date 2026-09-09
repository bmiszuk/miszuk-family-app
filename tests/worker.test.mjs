import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { migrationStatements } from '../scripts/migration-statements.mjs';

test('Cloudflare runtime: migrations, shared writes, conflict checks, and persisted reads', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: { entry: 'worker.js', formats: ['es'], fileName: 'worker' }, minify: false } });
  const output = Array.isArray(result) ? result[0] : result;
  const script = output.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).code;
  const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-07-05', bindings: { LOCAL_DEV: 'true', COZI_CALENDAR_URL:'https://rest.cozi.com/synthetic-private-feed' }, outboundService: async()=>new Response(readFileSync(new URL('./fixtures/cozi-sample.ics',import.meta.url),'utf8')), d1Databases: ['DB'] });
  try {
    const db = await mf.getD1Database('DB');
    for (const name of ['0001_initial_schema.sql', '0002_household_portal.sql', '0003_family_directory.sql', '0004_chat_requester.sql', '0005_login_identity.sql', '0006_households_dinner.sql', '0007_household_retirement.sql']) {
      const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
      await db.batch(migrationStatements(sql).map(value => db.prepare(value)));
    }
    async function call(path, method = 'GET', body) {
      const response = await mf.dispatchFetch(`http://localhost/api/${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
      return { status: response.status, data: await response.json() };
    }
    assert.equal((await call('me')).status, 200);
    const cozi=await call('cozi-calendar');
    assert.equal(cozi.status,200,JSON.stringify(cozi.data));
    assert.ok(Array.isArray(cozi.data.items));
    assert.ok(!JSON.stringify(cozi.data).includes('synthetic-private-feed'));
    assert.equal((await call('cozi-calendar','POST',{})).status,405);
    const { data: { item } } = await call('groceries', 'POST', { name: 'Runtime test', quantity: '2' });
    assert.ok(item.id);
    assert.equal((await call('groceries')).data.items[0].name, 'Runtime test');
    assert.equal((await call(`groceries/${item.id}`, 'PATCH', { ...item, done: true })).status, 200);
    assert.equal((await call(`groceries/${item.id}`, 'PATCH', { ...item, done: false })).status, 409);
    const imported = { items: [{ legacy_id: 'old', name: 'Imported' }] };
    assert.equal((await call('groceries/import', 'POST', imported)).status, 200);
    assert.equal((await call('groceries/import', 'POST', imported)).status, 200);
    assert.equal((await call('groceries')).data.items.length, 2);
    const actor=(await call('directory/people','POST',{first_name:'Actor',login_email:'family@localhost'})).data.item;
    assert.equal((await call('news', 'POST', { title: 'Hello', body: 'Shared from the runtime.' })).status, 201);
    assert.equal((await call('events', 'POST', { title: 'Holiday', all_day: true, start_at: '2026-12-25', timezone: 'America/Chicago' })).status, 201);
    assert.equal((await call('news')).data.items.length, 1);
    assert.equal((await call('events')).data.items.length, 1);
    const p = (await call('directory/people', 'POST', { first_name: 'Alex', last_name: 'Family', birth_date: '12-31' })).data.item;
    const q = (await call('directory/people', 'POST', { first_name: 'Sam', last_name: 'Family', birth_date: '1990-01-01' })).data.item;
    assert.ok(p.id); assert.ok(q.id);
    await db.prepare('UPDATE people SET login_email=NULL WHERE id=?').bind(actor.id).run();
    await db.prepare("UPDATE people SET login_email='family@localhost' WHERE id=?").bind(p.id).run();
    const marriage = (await call('directory/relationships', 'POST', { person1_id: p.id, person2_id: q.id, relationship_type: 'spouse', anniversary_date: '06-20' })).data.item;
    assert.ok(marriage.id);
    assert.equal((await call('directory/relationships', 'POST', { person1_id: q.id, person2_id: p.id, relationship_type: 'spouse' })).status, 409);
    assert.equal((await call(`directory/people/${p.id}`, 'DELETE', { version: 1 })).status, 409);
    assert.equal((await call('directory')).data.relationships.length, 1);
    assert.equal((await call(`directory/relationships/${marriage.id}`, 'DELETE', { version: 1 })).status, 200);
    assert.equal((await call(`directory/people/${p.id}`, 'DELETE', { version: 1 })).status, 200);
    const production = await mf.dispatchFetch('https://family.miszuk.com/api/me');
    assert.equal(production.status, 503);
  } finally { await mf.dispose(); }
});
