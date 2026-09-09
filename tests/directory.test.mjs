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
  db.exec(readFileSync(new URL('../migrations/0006_households_dinner.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0007_household_retirement.sql', import.meta.url), 'utf8'));
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

async function add(request, first_name, birth_date = '06-15') {
  const result = await request('/api/directory/people', 'POST', { first_name, last_name: 'Family', birth_date });
  assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data.item;
}
function identify(db,person) { person.login_email='family@localhost'; db.exec('UPDATE people SET login_email=NULL'); db.prepare("UPDATE people SET login_email='family@localhost' WHERE id=?").run(person.id); }
const link = (request, a, b, type = 'parent', anniversary_date = '') => request('/api/directory/relationships', 'POST', { person1_id: a.id, person2_id: b.id, relationship_type: type, anniversary_date });

test('directory person CRUD, optional birth year, stale edits and household preservation', async t => {
  const {request,db} = fixture(t);
  const grocery = await request('/api/groceries','POST',{name:'Keep me'});
  const a = await add(request,'Alex');
  identify(db,a);
  assert.equal(a.birth_date,'06-15');
  const updated = await request(`/api/directory/people/${a.id}`,'PATCH',{...a,first_name:'Alexander',birth_date:'1980-06-15'});
  assert.equal(updated.status,200); assert.equal(updated.data.item.version,2);
  assert.equal((await request(`/api/directory/people/${a.id}`,'PATCH',a)).status,409);
  assert.equal((await request(`/api/directory/people/${a.id}`,'DELETE',{version:1})).status,409);
  assert.equal((await request(`/api/directory/people/${a.id}`,'DELETE',{version:2})).status,200);
  assert.equal((await request('/api/directory')).data.people.length,0);
  assert.ok(db.prepare('SELECT deleted_at FROM people WHERE id=?').get(a.id).deleted_at);
  assert.equal((await request('/api/groceries')).data.items[0].id,grocery.data.item.id);
  assert.equal(db.prepare('SELECT name FROM families WHERE id=?').get('existing').name,'Existing family');
});

test('directory rejects invalid birthdays and self or missing relationships', async t => {
  const {request,db} = fixture(t);
  for (const birth_date of ['02-30','2023-02-29','13-01','2000-00-01','3000-01-01']) {
    assert.equal((await request('/api/directory/people','POST',{first_name:'Bad',last_name:'Date',birth_date})).status,400);
  }
  const a = await add(request,'Leap','02-29');
  identify(db,a);
  assert.equal((await link(request,a,a)).status,400);
  assert.equal((await link(request,{id:crypto.randomUUID()},a)).status,409);
});

test('one marriage represents both spouses, anniversary editing and safe person deletion', async t => {
  const {request,db} = fixture(t);
  const a = await add(request,'Alex'), b = await add(request,'Sam'), c = await add(request,'Pat');
  identify(db,a);
  const marriage = await link(request,a,b,'spouse','2005-07-04');
  assert.equal(marriage.status,201);
  assert.equal((await link(request,b,a,'spouse')).status,409);
  assert.equal((await link(request,c,a,'spouse')).status,409);
  assert.equal(db.prepare("SELECT count(*) AS n FROM relationships WHERE relationship_type='spouse'").get().n,1);
  const r = marriage.data.item;
  assert.equal((await request(`/api/directory/relationships/${r.id}`,'PATCH',{version:1,anniversary_date:'07-05'})).status,200);
  assert.equal((await request(`/api/directory/relationships/${r.id}`,'PATCH',{version:1,anniversary_date:'07-06'})).status,409);
  assert.equal((await request(`/api/directory/people/${a.id}`,'DELETE',{version:1})).status,409);
  assert.equal((await request(`/api/directory/relationships/${r.id}`,'DELETE',{version:2})).status,200);
  assert.equal((await request(`/api/directory/people/${a.id}`,'DELETE',{version:1})).status,200);
  assert.equal((await request('/api/directory')).data.people.length,2);
  assert.equal((await link(request,a,c,'spouse')).status,403);
});

test('parent links derive both directions and reject duplicates and cycles', async t => {
  const {request,db} = fixture(t);
  const a = await add(request,'Grandparent'), b = await add(request,'Parent'), c = await add(request,'Child');
  identify(db,b);
  assert.equal((await link(request,a,b)).status,201);
  identify(db,c);
  assert.equal((await link(request,b,c)).status,201);
  identify(db,b);
  assert.equal((await link(request,a,b)).status,409);
  identify(db,a);
  assert.equal((await link(request,c,a)).status,409);
  assert.equal((await link(request,b,a)).status,409);
  const rows = (await request('/api/directory')).data.relationships;
  assert.equal(rows.filter(r=>r.person2_id===b.id)[0].person1_id,a.id);
  assert.equal(rows.filter(r=>r.person1_id===b.id)[0].person2_id,c.id);
});


test('unknown birthdays remain blank through creation and editing', async t => {
  const {request,db} = fixture(t);
  const person = await add(request, 'Unknown', '');
  identify(db,person);
  assert.equal(person.birth_date, null);
  const edited = await request('/api/directory/people/' + person.id, 'PATCH', {...person, first_name: 'Updated'});
  assert.equal(edited.status, 200);
  assert.equal(edited.data.item.birth_date, null);
  const invalid = await request('/api/directory/people/' + person.id, 'PATCH', {...edited.data.item, birth_date: '09-00'});
  assert.equal(invalid.status, 400);
});

test('login mapping normalizes email, rejects duplicates, preserves omissions and ignores client identity', async t => {
  const {request}=fixture(t);
  const a=(await request('/api/directory/people','POST',{first_name:'Mapped',login_email:' FAMILY@LOCALHOST ',birth_date:null})).data.item;
  assert.equal(a.login_email,'family@localhost');
  assert.equal((await request('/api/me','GET',undefined,{headers:{'Cf-Access-Authenticated-User-Email':'spoof@example.com'}})).data.member.person.id,a.id);
  const duplicate=await request('/api/directory/people','POST',{first_name:'Other',login_email:'Family@Localhost'});
  assert.equal(duplicate.status,409);
  const edited=(await request(`/api/directory/people/${a.id}`,'PATCH',{first_name:'Renamed',version:1})).data.item;
  assert.equal(edited.login_email,'family@localhost');
  assert.equal((await request(`/api/directory/people/${a.id}`,'PATCH',{...edited,login_email:'not an email'})).status,400);
  assert.equal((await request(`/api/directory/people/${a.id}`,'PATCH',{...edited,login_email:''})).status,200);
  assert.equal((await request('/api/me')).data.member.person,null);
});

test('Directory self/parent authorization, transactional creation and no creator privilege',async t=>{
  const {request,db}=fixture(t);
  const actor=await add(request,'Actor');identify(db,actor);
  const spouse=await add(request,'Spouse');
  const childResult=await request('/api/directory/people','POST',{first_name:'Adult child',birth_date:'1980-01-01',relationships:[{relationship_type:'parent',person1_id:actor.id,person2_id:'self'},{relationship_type:'spouse',person1_id:'self',person2_id:spouse.id}]});
  assert.equal(childResult.status,201,JSON.stringify(childResult.data));
  const child=childResult.data.item;
  assert.equal((await request(`/api/directory/people/${child.id}`,'PATCH',{...child,first_name:'Edited adult child'})).status,200);
  assert.equal((await request(`/api/directory/people/${actor.id}`,'PATCH',{...actor,first_name:'Self'})).status,200);
  const unrelated=await add(request,'Unrelated');
  assert.equal((await request(`/api/directory/people/${unrelated.id}`,'PATCH',{...unrelated,first_name:'Denied'})).status,403);
  assert.equal((await request(`/api/directory/people/${unrelated.id}`,'DELETE',{version:1})).status,403);
  assert.equal((await link(request,actor,unrelated)).status,403); // Cannot grant oneself parent rights.
  const rels=(await request('/api/directory')).data.relationships;
  identify(db,unrelated);
  for(const r of rels)assert.equal((await request(`/api/directory/relationships/${r.id}`,'DELETE',{version:r.version})).status,403);
  const marriage=rels.find(r=>r.relationship_type==='spouse');
  assert.equal((await request(`/api/directory/relationships/${marriage.id}`,'PATCH',{version:1,anniversary_date:'01-01'})).status,403);
  const count=(await request('/api/directory')).data.people.length;
  const failed=await request('/api/directory/people','POST',{first_name:'Must roll back',relationships:[{relationship_type:'parent',person1_id:actor.id,person2_id:'self'},{relationship_type:'spouse',person1_id:'self',person2_id:spouse.id}]});
  assert.equal(failed.status,409);
  assert.equal((await request('/api/directory')).data.people.length,count);
  assert.equal((await request('/api/directory')).data.relationships.length,2);
  const created=await add(request,'Created without rights');
  assert.equal((await request(`/api/directory/people/${created.id}`,'PATCH',{...created,first_name:'Denied'})).status,403);
  db.exec('UPDATE people SET login_email=NULL');
  assert.equal((await request('/api/directory/people','POST',{first_name:'Unmapped creator allowed'})).status,201);
});

test('staged Directory updates save relationships together and roll back invalid links',async t=>{
  const {request,db}=fixture(t);const a=await add(request,'Self');identify(db,a);const b=await add(request,'Spouse');
  const saved=await request(`/api/directory/people/${a.id}`,'PATCH',{...a,first_name:'Updated',relationship_versions:[],relationships:[{relationship_type:'spouse',person1_id:a.id,person2_id:b.id,anniversary_date:'05-01'}]});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  const current=saved.data.item;
  const r=(await request('/api/directory')).data.relationships[0];
  const failed=await request(`/api/directory/people/${a.id}`,'PATCH',{...current,first_name:'Must roll back',relationship_versions:[r.id+':'+r.version],relationships:[r,{relationship_type:'parent',person1_id:crypto.randomUUID(),person2_id:a.id}]});
  assert.equal(failed.status,409);
  assert.equal(db.prepare('SELECT first_name FROM people WHERE id=?').get(a.id).first_name,'Updated');
  assert.equal((await request(`/api/directory/people/${a.id}`,'PATCH',{...current,relationship_versions:[r.id+':'+r.version],relationships:[]})).status,200);
  assert.equal((await request('/api/directory')).data.relationships.length,0);
});
