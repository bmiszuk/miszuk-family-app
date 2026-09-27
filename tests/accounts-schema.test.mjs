import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const migrations = new URL('../migrations/', import.meta.url);
const migration = readFileSync(new URL('0008_application_accounts.sql', migrations), 'utf8');
function fixture(t, apply = true) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const name of readdirSync(migrations).filter(n => /^000[1-7]_.*\.sql$/.test(n)).sort()) {
    db.exec(readFileSync(new URL(name, migrations), 'utf8'));
  }
  for (const id of ['p1', 'p2', 'p3']) db.prepare("INSERT INTO people(id,family_id,first_name,login_email) SELECT ?,id,?,? FROM families LIMIT 1").run(id, id, `${id}@example.test`);
  if (apply) db.exec(migration);
  return db;
}
function user(db, id = 'u1', person = 'p1') {
  db.prepare('INSERT INTO app_users(id,person_id) VALUES(?,?)').run(id, person);
}
function identity(db, id = 'i1', account = 'u1', email = 'one@example.test', issuer = 'https://access.example.test') {
  db.prepare("INSERT INTO user_identities(id,user_id,provider,issuer,login_email) VALUES(?,?,'cloudflare_access',?,?)").run(id, account, issuer, email);
}

test('account migration preserves every existing schema object and row and seeds no accounts', t => {
  const db = fixture(t, false);
  db.exec(`INSERT INTO grocery_items(id,name,created_by,created_at,updated_at) VALUES('g','Preserved','actor','now','now');
    INSERT INTO news_posts(id,title,body,author_name,created_by,created_at,updated_at) VALUES('n','Title','Body','Author','actor','now','now');
    INSERT INTO household_events(id,title,start_at,timezone,author_name,created_by,created_at,updated_at) VALUES('e','Event','2026-01-01','America/Chicago','Author','actor','now','now');
    INSERT INTO events(id,family_id,title,event_date) SELECT 'legacy',id,'Legacy','2026-01-01' FROM families LIMIT 1;
    INSERT INTO relationships(id,family_id,person1_id,person2_id,relationship_type) SELECT 'r',id,'p1','p2','parent' FROM families LIMIT 1;
    INSERT INTO dinner_signups(household_id,day,person_id,updated_at) SELECT id,'2026-01-01','p1','now' FROM households LIMIT 1;`);
  const schema = db.prepare("SELECT * FROM sqlite_schema ORDER BY type,name").all();
  const tables = schema.filter(r => r.type === 'table').map(r => r.name);
  const rows = Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
  db.exec(migration);
  for (const entry of schema) assert.deepEqual(db.prepare('SELECT * FROM sqlite_schema WHERE name=?').get(entry.name), entry);
  for (const name of tables) assert.deepEqual(db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(), rows[name]);
  for (const name of ['app_users', 'user_identities', 'security_audit']) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('accounts require unique existing people, valid status/role/version and safe defaults', t => {
  const db = fixture(t);
  user(db);
  const row = db.prepare('SELECT * FROM app_users').get();
  assert.equal(row.status, 'pending'); assert.equal(row.role, 'member'); assert.equal(row.version, 1);
  assert.ok(row.created_at); assert.ok(row.updated_at);
  assert.throws(() => user(db, 'u2', 'p1'), /UNIQUE/);
  assert.throws(() => user(db, 'u2', 'missing'), /FOREIGN KEY/);
  assert.throws(() => db.exec("INSERT INTO app_users(id) VALUES('missing-person')"), /NOT NULL/);
  for (const statement of ["status='unknown'", "role='superuser'", 'version=0', 'version=1.5']) assert.throws(() => db.exec(`UPDATE app_users SET ${statement}`), /CHECK/);
  for (const status of ['active', 'disabled', 'pending']) db.prepare("UPDATE app_users SET status=?,role='administrator',version=version+1").run(status);
  assert.throws(() => db.exec("DELETE FROM people WHERE id='p1'"), /FOREIGN KEY/);
});

test('identities enforce normalized issuer-scoped uniqueness, one identity per account and binding consistency', t => {
  const db = fixture(t); user(db); user(db, 'u2', 'p2'); user(db, 'u3', 'p3');
  identity(db);
  assert.equal(db.prepare('SELECT subject FROM user_identities').get().subject, null);
  assert.throws(() => identity(db, 'i2', 'u1', 'other@example.test'), /UNIQUE/);
  assert.throws(() => identity(db, 'i2', 'u2'), /UNIQUE/);
  assert.throws(() => identity(db, 'i2', 'u2', ' ONE@example.test '), /CHECK/);
  assert.throws(() => identity(db, 'i2', 'missing', 'two@example.test'), /FOREIGN KEY/);
  identity(db, 'i2', 'u2', 'two@example.test');
  identity(db, 'i3', 'u3', 'one@example.test', 'https://other.example.test');
  assert.throws(() => db.exec("UPDATE user_identities SET subject='sub' WHERE id='i1'"), /CHECK/);
  assert.throws(() => db.exec("UPDATE user_identities SET bound_at='now' WHERE id='i1'"), /CHECK/);
  db.exec("UPDATE user_identities SET subject='sub',bound_at=CURRENT_TIMESTAMP WHERE id='i1'");
  assert.throws(() => db.exec("UPDATE user_identities SET subject='sub',bound_at=CURRENT_TIMESTAMP WHERE id='i2'"), /UNIQUE/);
  db.exec("UPDATE user_identities SET subject='sub',bound_at=CURRENT_TIMESTAMP WHERE id='i3'");
  assert.throws(() => db.exec("DELETE FROM app_users WHERE id='u1'"), /FOREIGN KEY/);
});

test('audit supports explicit account/operator/bootstrap actors, structured details and non-cascading retention', t => {
  const db = fixture(t); user(db);
  db.exec("INSERT INTO security_audit(id,actor_type,actor_user_id,action,target_type,target_id) VALUES('a','user','u1','account.disable','account','u2')");
  for (const type of ['operator', 'bootstrap']) db.prepare("INSERT INTO security_audit(id,actor_type,actor_label,action,target_type,target_id,details) VALUES(?,?, 'controlled maintenance','account.provision','account','u1',?)").run(type, type, '{"role":"member"}');
  assert.ok(db.prepare("SELECT occurred_at FROM security_audit WHERE id='a'").get().occurred_at);
  for (const change of ["actor_type='unknown'", 'actor_user_id=NULL', "actor_label='someone'", "details='invalid'", "details='[]'", "action=''", "target_id=''", "details='" + JSON.stringify({text:'x'.repeat(8192)}) + "'"]) assert.throws(() => db.exec(`UPDATE security_audit SET ${change} WHERE id='a'`), /CHECK/);
  assert.throws(() => db.exec("UPDATE security_audit SET actor_user_id='missing' WHERE id='a'"), /FOREIGN KEY/);
  assert.throws(() => db.exec("DELETE FROM app_users WHERE id='u1'"), /FOREIGN KEY/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM security_audit').get().n, 3);
});
