import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import recovery from '../scripts/account-recovery-worker.js';
import {resolveAccount} from '../src/api/shared/accounts.js';
import {accountSeed,localPerson,defaultHousehold} from './account-fixture.mjs';

const routes=[['notifications/config','GET'],['notifications/subscriptions','GET'],['notifications/subscriptions','POST'],['notifications/subscriptions/id','DELETE'],['notifications/preferences','GET'],['notifications/preferences','PATCH'],['notifications/test','POST'],['admin/accounts/id/role','POST'],['admin/accounts/id/identity','POST'],['admin/accounts','POST'],['admin/accounts/id/enable','POST'],['admin/accounts/id/disable','POST'],['admin/accounts','GET'],['admin/accounts/id','GET'],['admin/security-audit','GET'],['me','GET'],['directory','GET'],['directory/people','POST'],['directory/people/id','PATCH'],['directory/people/id','DELETE'],['directory/relationships','POST'],['directory/relationships/id','PATCH'],['directory/relationships/id','DELETE'],['households','GET'],['households','POST'],['households/id','PATCH'],['households/id','DELETE'],['groceries','GET'],['groceries','POST'],['groceries/id','PATCH'],['groceries/id','DELETE'],['groceries/import','POST'],['groceries/checked','DELETE'],['dinner','GET'],['dinner/2026-09-28','PUT'],['news','GET'],['news','POST'],['news/id','PATCH'],['news/id','DELETE'],['cozi-calendar','GET'],['events','GET'],['events','POST'],['events/id','PATCH'],['events/id','DELETE'],['people','GET'],['people','POST'],['families','GET'],['families','POST'],['unknown','GET'],['groceries','OPTIONS'],['cozi-calendar','HEAD']];
function fixture(t) {
 const db=new DatabaseSync(':memory:'); t.after(()=>db.close());
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec(accountSeed);
 const queries=[];
 const DB={prepare(sql){queries.push(sql);const stmt=db.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return stmt.run(...args);}};},async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,ACCESS_TEAM_DOMAIN:'boundary.cloudflareaccess.com',ACCESS_AUD:'aud',COZI_CALENDAR_URL:'https://rest.cozi.com/boundary-test'};
 db.prepare('UPDATE user_identities SET issuer=?').run('https://'+env.ACCESS_TEAM_DOMAIN);
 return {db,env,queries};
}

test('signed production Worker gate covers every route, warm Cozi cache, revocation and failure states',async t=>{
 const {db,env,queries}=fixture(t);const keys=await generateKeyPair('RS256'),jwk=await exportJWK(keys.publicKey);jwk.kid='boundary';jwk.alg='RS256';
 const oldFetch=globalThis.fetch;let feedFetches=0;
 globalThis.fetch=async url=>{if(String(url).endsWith('/certs'))return new Response(JSON.stringify({keys:[jwk]}));feedFetches++;return new Response(readFileSync(new URL('./fixtures/cozi-sample.ics',import.meta.url),'utf8'));};
 t.after(()=>{globalThis.fetch=oldFetch;});
 const {default:worker}=await import('../worker.js');
 const token=await new SignJWT({email:'family@localhost'}).setProtectedHeader({alg:'RS256',kid:'boundary'}).setIssuer('https://'+env.ACCESS_TEAM_DOMAIN).setAudience('aud').setSubject('local-development').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
 async function call(path,method='GET',runtime=worker,override={}) {const r=await runtime.fetch(new Request('https://family.miszuk.com/api/'+path,{method,headers:{'Cf-Access-Jwt-Assertion':token,'Content-Type':'application/json'},...(!['GET','HEAD'].includes(method)?{body:'{}'}:{})}),{...env,...override});return {status:r.status,body:await r.json()};}
 for(const role of ['member','administrator']) {db.prepare('UPDATE app_users SET role=?').run(role);const r=await call('me');assert.equal(r.status,200);assert.equal(r.body.member.account.role,role);assert.ok(!JSON.stringify(r.body).includes('local-development'));assert.ok(!JSON.stringify(r.body).includes('family@localhost'));}
 assert.equal((await call('cozi-calendar')).status,200);assert.equal((await call('cozi-calendar')).status,200);assert.equal(feedFetches,1);
 for(const status of ['disabled','pending']) {
  db.prepare('UPDATE app_users SET status=?').run(status);
  for(const [path,method] of routes) {queries.length=0;const r=await call(path,method);assert.equal(r.status,403,path);assert.equal(r.body.code,'APPLICATION_ACCESS_DENIED');assert.deepEqual(Object.keys(r.body).sort(),['code','error']);assert.equal(queries.length,1,path);assert.match(queries[0],/FROM user_identities/);}
 }
 assert.equal(feedFetches,1,'warm calendar did not bypass gate');
 db.exec("UPDATE app_users SET status='active'; UPDATE people SET deleted_at='now'");assert.equal((await call('me')).status,403);
 db.exec('UPDATE people SET deleted_at=NULL');
 db.exec("UPDATE user_identities SET subject='different'");assert.equal((await call('me')).status,403);
 db.exec("UPDATE user_identities SET subject='local-development',login_email='different@example.test'");assert.equal((await call('me')).status,403);
 db.exec("UPDATE user_identities SET login_email='family@localhost'; UPDATE people SET household_id=NULL");
 const noHouse=await call('me');assert.equal(noHouse.status,200);assert.equal(noHouse.body.member.household,null);
 for(const path of ['directory','news','events','people','families','households','cozi-calendar'])assert.equal((await call(path)).status,200,path);
 for(const [path,method] of routes.filter(([p])=>p.startsWith('groceries')||p.startsWith('dinner')))assert.equal((await call(path,method)).body.code,'HOUSEHOLD_REQUIRED');
 db.prepare('UPDATE people SET household_id=?').run(defaultHousehold);
 // Retired household is unusable but does not revoke family-wide membership.
 db.exec('DROP TRIGGER household_delete_members');db.prepare("UPDATE households SET deleted_at='now' WHERE id=?").run(defaultHousehold);
 assert.equal((await call('me')).body.member.household,null);assert.equal((await call('groceries')).status,403);
 db.exec('UPDATE households SET deleted_at=NULL');
 // Missing linked person is rejected even if database integrity has been damaged.
 db.exec("PRAGMA foreign_keys=OFF; UPDATE app_users SET person_id='missing'");assert.equal((await call('me')).status,403);
 db.prepare('UPDATE app_users SET person_id=?').run(localPerson);
 // Approved-unbound activation is done on the request path, not in background work.
 db.exec('UPDATE user_identities SET subject=NULL,bound_at=NULL');assert.equal((await call('me')).status,200);
 assert.equal(db.prepare("SELECT count(*) n FROM security_audit WHERE action='identity.bind'").get().n,1);
 assert.equal((await call('me')).status,200);assert.equal(db.prepare('SELECT count(*) n FROM security_audit').get().n,1);
 assert.equal((await call('directory','GET',recovery)).status,503);
 db.exec("UPDATE app_users SET status='disabled'");assert.equal((await call('directory','GET',recovery)).status,403);
 db.exec('DELETE FROM security_audit; DELETE FROM user_identities; DELETE FROM app_users');
 for(const [path,method] of routes)assert.equal((await call(path,method)).status,403,path);
 assert.equal((await call('me','GET',worker,{DB:{prepare(){throw new Error('private detail');}}})).body.code,'APPLICATION_ACCESS_UNAVAILABLE');
 const missing=await worker.fetch(new Request('https://family.miszuk.com/api/me'),env);assert.equal(missing.status,401);assert.equal((await missing.json()).code,'AUTHENTICATION_REQUIRED');
});

test('binding audit failure rolls back; repeated requests bind exactly once',async t=>{
 const {db,env}=fixture(t);const principal={id:'new-subject',email:'family@localhost',local:false};
 db.exec('UPDATE user_identities SET subject=NULL,bound_at=NULL');
 db.exec("CREATE TRIGGER fail_binding BEFORE INSERT ON security_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 await assert.rejects(resolveAccount(env,principal));assert.equal(db.prepare('SELECT subject FROM user_identities').get().subject,null);assert.equal(db.prepare('SELECT count(*) n FROM security_audit').get().n,0);
 db.exec('DROP TRIGGER fail_binding');
 await resolveAccount(env,principal);await resolveAccount(env,principal);
 assert.equal(db.prepare('SELECT count(*) n FROM security_audit').get().n,1);
});
