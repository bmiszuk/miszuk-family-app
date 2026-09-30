import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {resolveAccount} from '../src/api/shared/accounts.js';
import {observeAccountComparison} from '../src/api/shared/accountComparison.js';
import {provisionApprovedMembers} from '../scripts/provision-approved-members.mjs';
const domain='activation-test.cloudflareaccess.com',issuer=`https://${domain}`;
const principal={id:'verified-subject',email:'member@example.test',local:false};
const entry={personId:'p1',email:principal.email,householdId:'h',householdName:'Example',issuer,userId:'u1',identityId:'i1',auditId:'provision1'};
const setup=`INSERT INTO households(id,name) VALUES('h','Example');
INSERT INTO people(id,family_id,first_name,login_email,household_id) SELECT 'admin',id,'Admin','admin@example.test','h' FROM families LIMIT 1;
INSERT INTO app_users(id,person_id,status,role) VALUES('admin','admin','active','administrator');
INSERT INTO people(id,family_id,first_name,login_email,household_id) SELECT 'p1',id,'Member','member@example.test','h' FROM families LIMIT 1;`;
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const root=new URL('../migrations/',import.meta.url);
 for(const n of readdirSync(root).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(n,root),'utf8'));
 db.exec(setup);
 const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return stmt.run(...args);}};},async batch(statements){db.exec('BEGIN');try{for(const s of statements)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {db,env:{DB,ACCESS_TEAM_DOMAIN:domain}};
}
test('approved roster provisioning is repeat-safe and leaves members active but unbound',async t=>{
 const {db,env}=fixture(t);
 assert.deepEqual(await provisionApprovedMembers(env.DB,'admin',[entry]),{created:1,alreadyProvisioned:0});
 assert.deepEqual(await provisionApprovedMembers(env.DB,'admin',[entry]),{created:0,alreadyProvisioned:1});
 assert.equal(db.prepare("SELECT role FROM app_users WHERE id='u1'").get().role,'member');
 assert.equal(db.prepare('SELECT subject FROM user_identities').get().subject,null);
 assert.equal(db.prepare('SELECT bound_at FROM user_identities').get().bound_at,null);
 assert.equal(db.prepare('SELECT count(*) AS n FROM security_audit').get().n,1);
 db.exec("UPDATE people SET login_email='changed@example.test' WHERE id='p1'");
 await assert.rejects(provisionApprovedMembers(env.DB,'admin',[entry]),/changed/);
});
test('active approved identity binds verified subject once, independently of editable Directory email',async t=>{
 const {db,env}=fixture(t);await provisionApprovedMembers(env.DB,'admin',[entry]);
 db.exec("UPDATE people SET login_email=NULL WHERE id='p1'");
 const result=await resolveAccount(env,{...principal,email:' MEMBER@EXAMPLE.TEST '});
 assert.equal(result.status,'resolved');assert.equal(result.account.role,'member');
 const bound=db.prepare('SELECT * FROM user_identities').get();assert.equal(bound.subject,principal.id);assert.ok(bound.bound_at);
 await resolveAccount(env,principal);assert.deepEqual(db.prepare('SELECT * FROM user_identities').get(),bound);
 assert.equal(db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='identity.bind'").get().n,1);
 assert.equal(db.prepare("SELECT status FROM app_users WHERE id='u1'").get().status,'active');
});
test('pending account activates atomically with binding; disabled/inactive/local identities cannot bind',async t=>{
 const {db,env}=fixture(t);await provisionApprovedMembers(env.DB,'admin',[entry]);
 assert.equal((await resolveAccount(env,{...principal,local:true})).status,'identity_mismatch');
 db.exec("UPDATE app_users SET status='disabled' WHERE id='u1'");
 assert.equal((await resolveAccount(env,principal)).status,'disabled');
 db.exec("UPDATE app_users SET status='pending' WHERE id='u1'; UPDATE people SET deleted_at='now' WHERE id='p1'");
 assert.equal((await resolveAccount(env,principal)).status,'person_inactive');
 assert.equal(db.prepare('SELECT subject FROM user_identities').get().subject,null);
 db.exec("UPDATE people SET deleted_at=NULL WHERE id='p1'");
 assert.equal((await resolveAccount(env,principal)).status,'resolved');
 assert.equal(db.prepare("SELECT version FROM app_users WHERE id='u1'").get().version,2);
});
test('wrong/unknown emails and wrong issuer never provision or bind; matching is not alias inference',async t=>{
 const {db,env}=fixture(t);await provisionApprovedMembers(env.DB,'admin',[entry]);
 for(const email of ['unknown@example.test','member+alias@example.test','mem.ber@example.test'])assert.equal((await resolveAccount(env,{...principal,email})).status,'unprovisioned');
 assert.equal((await resolveAccount({...env,ACCESS_TEAM_DOMAIN:'other.cloudflareaccess.com'},principal)).status,'unprovisioned');
 assert.equal(db.prepare('SELECT subject FROM user_identities').get().subject,null);
 assert.equal(db.prepare('SELECT count(*) AS n FROM app_users').get().n,2);
 assert.equal(db.prepare('SELECT count(*) AS n FROM security_audit').get().n,1);
});
test('already-bound email/subject mismatches never overwrite identity; comparison still only reports',async t=>{
 const {db,env}=fixture(t);await provisionApprovedMembers(env.DB,'admin',[entry]);await resolveAccount(env,principal);
 assert.equal((await resolveAccount(env,{...principal,id:'another-subject'})).status,'identity_mismatch');
 assert.equal((await resolveAccount(env,{...principal,email:'other@example.test'})).status,'identity_mismatch');
 assert.equal(await observeAccountComparison(env,principal,()=>{}),'member_match');
 assert.equal(db.prepare('SELECT subject FROM user_identities').get().subject,principal.id);
 assert.equal(db.prepare("SELECT count(*) AS n FROM security_audit WHERE action='identity.bind'").get().n,1);
});
test('conflicting subject rejects binding without audit; failure to audit rolls binding back',async t=>{
 const {db,env}=fixture(t);await provisionApprovedMembers(env.DB,'admin',[entry]);
 db.prepare("INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES('admin','admin','cloudflare_access',?,'admin@example.test',?,'now')").run(issuer,principal.id);
 assert.equal((await resolveAccount(env,principal)).status,'conflict');
 assert.equal(db.prepare("SELECT subject FROM user_identities WHERE id='i1'").get().subject,null);
 db.exec("DELETE FROM user_identities WHERE id='admin'; CREATE TRIGGER fail_binding_audit BEFORE INSERT ON security_audit WHEN NEW.action='identity.bind' BEGIN SELECT RAISE(ABORT,'audit failed'); END;");
 assert.equal(await observeAccountComparison(env,principal,()=>{}),'unavailable');
 assert.equal(db.prepare("SELECT subject FROM user_identities WHERE id='i1'").get().subject,null);
});
test('D1 concurrent activation is atomic and creates exactly one binding audit',async()=>{
 const {Miniflare}=await import('miniflare');const {migrationStatements}=await import('../scripts/migration-statements.mjs');
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-07-05',d1Databases:['DB']});
 try{
 const DB=await mf.getD1Database('DB'),root=new URL('../migrations/',import.meta.url);
 for(const n of readdirSync(root).filter(n=>n.endsWith('.sql')).sort())await DB.batch(migrationStatements(readFileSync(new URL(n,root),'utf8')).map(sql=>DB.prepare(sql)));
 await DB.batch(migrationStatements(setup).map(sql=>DB.prepare(sql)));
 await provisionApprovedMembers(DB,'admin',[entry]);
 const env={DB,ACCESS_TEAM_DOMAIN:domain};
 const results=await Promise.all([resolveAccount(env,principal),resolveAccount(env,principal),resolveAccount(env,principal)]);
 assert.ok(results.every(r=>r.status==='resolved'));
 assert.equal((await DB.prepare("SELECT count(*) AS n FROM security_audit WHERE action='identity.bind'").first()).n,1);
 assert.deepEqual(await provisionApprovedMembers(DB,'admin',[entry]),{created:0,alreadyProvisioned:1});
 assert.equal((await DB.prepare("SELECT subject FROM user_identities WHERE id='i1'").first()).subject,principal.id);
 assert.equal((await DB.prepare("SELECT version FROM app_users WHERE id='u1'").first()).version,2);
 }finally{await mf.dispose();}
});
