import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {resolveAccount,compareAccount} from '../src/api/shared/accounts.js';
import {observeAccountComparison} from '../src/api/shared/accountComparison.js';
import {householdIdentity,DEFAULT_HOUSEHOLD} from '../src/api/shared/identity.js';
import {provisionInitialAdministrator} from '../scripts/provision-initial-administrator.mjs';
import worker from '../worker.js';

const domain='phase2-test.cloudflareaccess.com';
const verified={personId:'p1',subject:'verified-subject',email:'member@example.test',issuer:`https://${domain}`,userId:'u1',identityId:'i1',auditId:'a1'};
const member={id:verified.subject,email:verified.email,name:'Example',local:false};
function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const root=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(root).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,root),'utf8'));
  db.prepare("INSERT INTO people(id,family_id,first_name,login_email,household_id) SELECT 'p1',id,'Example',?,? FROM families LIMIT 1").run(member.email,DEFAULT_HOUSEHOLD);
  const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {sql,bind(...values){args=values;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return stmt.run(...args);}};},async batch(statements){db.exec('BEGIN');try{const results=[];for(const stmt of statements)results.push(await stmt.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
  return {db,env:{DB,ACCESS_TEAM_DOMAIN:domain,ACCESS_AUD:'test-aud'}};
}

test('controlled initial provisioning is atomic, exact-repeat safe and never repairs conflicting state',async t=>{
  const {db,env}=fixture(t);
  assert.equal(await provisionInitialAdministrator(env.DB,verified),'provisioned');
  const snapshot=JSON.stringify(db.prepare('SELECT * FROM app_users').all());
  assert.equal(await provisionInitialAdministrator(env.DB,verified),'already_provisioned');
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM app_users').all()),snapshot);
  assert.equal(db.prepare('SELECT count(*) AS n FROM security_audit').get().n,1);
  await assert.rejects(provisionInitialAdministrator(env.DB,{...verified,subject:'different'}),/conflict/);
  db.exec("UPDATE app_users SET status='disabled'");
  await assert.rejects(provisionInitialAdministrator(env.DB,verified),/conflict/);
});

test('provisioning validates reviewed person and rolls back all writes on batch failure',async t=>{
  const {db,env}=fixture(t);
  await assert.rejects(provisionInitialAdministrator(env.DB,{...verified,email:'other@example.test'}),/mismatch/);
  db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON security_audit BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  await assert.rejects(provisionInitialAdministrator(env.DB,verified),/test failure/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM app_users').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM user_identities').get().n,0);
});

test('active Administrator resolves only from bound trusted identity; legacy email is not authoritative',async t=>{
  const {db,env}=fixture(t);await provisionInitialAdministrator(env.DB,verified);
  const resolved=await resolveAccount(env,{...member,email:' MEMBER@EXAMPLE.TEST '});
  assert.equal(resolved.status,'resolved');assert.equal(resolved.account.role,'administrator');assert.equal(resolved.person.id,'p1');assert.equal(resolved.household.id,DEFAULT_HOUSEHOLD);
  assert.equal(compareAccount(await householdIdentity(env,member),resolved),'administrator_match');
  db.exec('UPDATE people SET login_email=NULL');
  assert.equal((await resolveAccount(env,member)).status,'resolved');
  assert.equal(await observeAccountComparison(env,member,()=>{}),'person_mismatch');
});

test('unprovisioned, disabled, pending and mismatched subjects/emails do not resolve or bind',async t=>{
  const {db,env}=fixture(t);
  assert.equal((await resolveAccount(env,member)).status,'unprovisioned');
  await provisionInitialAdministrator(env.DB,verified);
  for(const status of ['disabled','pending']) {db.prepare('UPDATE app_users SET status=?').run(status);assert.equal((await resolveAccount(env,member)).status,status);}
  db.exec("UPDATE app_users SET status='active'");
  for(const principal of [{...member,id:'wrong'},{...member,email:'wrong@example.test'}])assert.equal((await resolveAccount(env,principal)).status,'identity_mismatch');
  assert.equal((await resolveAccount({...env,ACCESS_TEAM_DOMAIN:'other.cloudflareaccess.com'},member)).status,'unprovisioned');
  db.exec('UPDATE user_identities SET subject=NULL,bound_at=NULL');
  assert.equal((await resolveAccount(env,member,{allowBinding:false})).status,'identity_mismatch');
  assert.equal(db.prepare('SELECT subject FROM user_identities').get().subject,null);
});

test('inactive/missing people and households fail resolution; unassigned account has no fallback',async t=>{
  const {db,env}=fixture(t);await provisionInitialAdministrator(env.DB,verified);
  db.exec("UPDATE people SET deleted_at='now'");
  assert.equal((await resolveAccount(env,member)).status,'person_inactive');
  db.exec('UPDATE people SET deleted_at=NULL,household_id=NULL');
  const resolved=await resolveAccount(env,member);
  assert.equal(resolved.status,'resolved');assert.equal(resolved.household,null);
  assert.equal(compareAccount(await householdIdentity(env,member),resolved),'household_mismatch');
  db.exec('PRAGMA foreign_keys=OFF');db.exec("UPDATE app_users SET person_id='missing'");
  assert.equal((await resolveAccount(env,member)).status,'person_inactive');
});

test('subject/email collision and duplicate identities are rejected rather than taking first match',async t=>{
  const {db,env}=fixture(t);await provisionInitialAdministrator(env.DB,verified);
  db.exec("INSERT INTO people(id,family_id,first_name) SELECT 'p2',id,'Other' FROM families LIMIT 1; INSERT INTO app_users(id,person_id,status) VALUES('u2','p2','active');");
  db.prepare("INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES('i2','u2','cloudflare_access',?,'other@example.test','other-sub','now')").run(verified.issuer);
  assert.equal((await resolveAccount(env,{...member,email:'other@example.test'})).status,'conflict');
  db.exec("DROP INDEX idx_user_identities_subject; UPDATE user_identities SET subject='verified-subject' WHERE id='i2'");
  assert.equal((await resolveAccount(env,member)).status,'conflict');
});

test('comparison reports only finite codes and isolates database/reporter failures',async t=>{
  const {env}=fixture(t);await provisionInitialAdministrator(env.DB,verified);
  const reports=[];assert.equal(await observeAccountComparison(env,member,code=>reports.push(code)),'administrator_match');
  assert.deepEqual(reports,['administrator_match']);
  const broken={...env,DB:{prepare(){throw new Error('secret database identity');}}};
  assert.equal(await observeAccountComparison(broken,member,code=>reports.push(code)),'unavailable');
  assert.ok(!JSON.stringify(reports).includes(member.email));
  assert.equal(await observeAccountComparison(env,member,()=>{throw new Error('logger failed');}),'administrator_match');
});

test('real signed authenticated requests enforce accounts before all handlers',async t=>{
  const {db,env}=fixture(t);
  const keys=await generateKeyPair('RS256');const jwk=await exportJWK(keys.publicKey);jwk.kid='test-key';jwk.alg='RS256';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{assert.equal(String(url),`https://${domain}/cdn-cgi/access/certs`);return new Response(JSON.stringify({keys:[jwk]}));};
  t.after(()=>{globalThis.fetch=originalFetch;});
  const jwt=await new SignJWT({email:member.email}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(verified.issuer).setAudience('test-aud').setSubject(member.id).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  async function call(path) {
    const observations=[];const response=await worker.fetch(new Request(`https://family.miszuk.com/api/${path}`,{headers:{'Cf-Access-Jwt-Assertion':jwt}}),env,{waitUntil(p){observations.push(p);}});
    await Promise.all(observations);return {status:response.status,body:await response.json()};
  }
  const before=await call('me');assert.equal(before.status,403);assert.equal(before.body.code,'APPLICATION_ACCESS_DENIED');
  await provisionInitialAdministrator(env.DB,verified);
  const active=await call('me');assert.equal(active.status,200);assert.equal(active.body.member.person.id,'p1');
  assert.ok(!('id' in active.body.member));
  for(const path of ['groceries','news','directory','households','dinner'])assert.equal((await call(path)).status,200,path);
  assert.deepEqual(await call('me'),active);
  db.exec("UPDATE app_users SET status='disabled'");assert.deepEqual(await call('me'),before);
  db.exec('DROP TABLE security_audit; DROP TABLE user_identities; DROP TABLE app_users');assert.equal((await call('me')).status,503);
});

test('D1 runtime provisioning is atomic and repeat-safe',async()=>{
  const {Miniflare}=await import('miniflare');
  const {migrationStatements}=await import('../scripts/migration-statements.mjs');
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-07-05',d1Databases:['DB']});
  try {
    const db=await mf.getD1Database('DB'),root=new URL('../migrations/',import.meta.url);
    for(const name of readdirSync(root).filter(n=>n.endsWith('.sql')).sort())await db.batch(migrationStatements(readFileSync(new URL(name,root),'utf8')).map(sql=>db.prepare(sql)));
    await db.prepare("INSERT INTO people(id,family_id,first_name,login_email) SELECT 'p1',id,'Example',? FROM families LIMIT 1").bind(member.email).run();
    await db.prepare("CREATE TRIGGER test_audit_failure BEFORE INSERT ON security_audit BEGIN SELECT RAISE(ABORT,'test rollback'); END").run();
    await assert.rejects(provisionInitialAdministrator(db,verified),/test rollback/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM app_users').first()).n,0);
    await db.prepare('DROP TRIGGER test_audit_failure').run();
    assert.equal(await provisionInitialAdministrator(db,verified),'provisioned');
    assert.equal(await provisionInitialAdministrator(db,verified),'already_provisioned');
    const result=await resolveAccount({DB:db,ACCESS_TEAM_DOMAIN:domain},member);
    assert.equal(result.status,'resolved');assert.equal(result.account.role,'administrator');assert.equal(result.household,null);
  } finally {await mf.dispose();}
});
