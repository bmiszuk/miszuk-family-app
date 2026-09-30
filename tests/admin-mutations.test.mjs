import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import {resolveAccount} from '../src/api/shared/accounts.js';
import {requireAccount} from '../src/api/shared/accountGate.js';
const env=DB=>({DB,ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com'});
const principal=email=>({id:'subject-'+email,email,local:false});
const admin=db=>db.exec("UPDATE app_users SET role='administrator' WHERE id='local-account'");
const add=async request=>(await request('/api/directory/people','POST',{first_name:'New Member'})).data.item;
const provision=(request,p,email='new@example.test',extra={})=>request('/api/admin/accounts','POST',{person_id:p.id,person_version:p.version,login_email:email,confirm_email:email,...extra});
const status=(request,item,operation,version=item.version)=>request('/api/admin/accounts/'+item.id+'/'+operation,'POST',{version});
const audits=db=>db.prepare('SELECT count(*) n FROM security_audit').get().n;

test('provision explicitly approved pending Member, bind on first verified use, reserve identities while disabled',async t=>{
 const {db,DB,request}=fixture(t);admin(db);const p=await add(request);const before=db.prepare('SELECT * FROM people WHERE id=?').get(p.id);
 const created=await provision(request,p,' NEW@Example.Test ');assert.equal(created.status,201,JSON.stringify(created.data));let account=created.data.item;
 assert.equal(account.status,'pending');assert.equal(account.role,'member');assert.equal(account.identity_state,'awaiting_first_sign_in');assert.equal(account.approved_email,'new@example.test');
 assert.deepEqual(db.prepare('SELECT * FROM people WHERE id=?').get(p.id),before);assert.equal(db.prepare('SELECT subject FROM user_identities WHERE user_id=?').get(account.id).subject,null);
 assert.equal((await provision(request,p)).status,409);const second=await add(request);assert.equal((await provision(request,second,'NEW@example.test')).status,409);
 assert.equal((await resolveAccount(env(DB),principal('wrong@example.test'))).status,'unprovisioned');
 assert.equal((await resolveAccount(env(DB),principal('new@example.test'))).status,'resolved');account=(await request('/api/admin/accounts/'+account.id)).data.item;assert.equal(account.status,'active');assert.equal(account.version,2);
 const identity=db.prepare('SELECT * FROM user_identities WHERE user_id=?').get(account.id);
 const disabled=await status(request,account,'disable');assert.equal(disabled.status,200);assert.equal(disabled.data.item.status,'disabled');
 await assert.rejects(requireAccount(env(DB),principal('new@example.test')),e=>e.status===403);
 assert.deepEqual(db.prepare('SELECT * FROM user_identities WHERE user_id=?').get(account.id),identity);
 assert.equal((await provision(request,second,'new@example.test')).status,409);
 const enabled=await status(request,disabled.data.item,'enable');assert.equal(enabled.status,200);assert.equal(enabled.data.item.status,'active');
 assert.equal((await resolveAccount(env(DB),principal('new@example.test'))).status,'resolved');
 assert.deepEqual(db.prepare('SELECT action FROM security_audit ORDER BY rowid').all().map(r=>r.action),['account.provision','identity.bind','account.disable','account.enable']);
});
test('unbound enable returns pending without fabricating identity; stale state/version and unsupported fields reject',async t=>{
 const {db,request}=fixture(t);admin(db);const p=await add(request);let item=(await provision(request,p)).data.item;
 assert.equal((await status(request,item,'enable')).status,409);
 const disabled=(await status(request,item,'disable')).data.item;
 assert.equal((await status(request,item,'disable')).status,409);
 const enabled=await status(request,disabled,'enable');assert.equal(enabled.status,200);assert.equal(enabled.data.item.status,'pending');
 assert.equal(db.prepare('SELECT subject FROM user_identities WHERE user_id=?').get(item.id).subject,null);
 assert.equal((await status(request,disabled,'enable')).status,409);
 assert.equal((await request('/api/admin/accounts/'+item.id+'/disable','POST',{version:enabled.data.item.version,role:'administrator'})).status,400);
 assert.equal((await request('/api/admin/accounts/missing/disable','POST',{version:1})).status,409);
 assert.equal(audits(db),3);
});
test('provision rejects inactive/stale people, invalid emails, mismatched confirmation and extra security fields',async t=>{
 const {db,request}=fixture(t);admin(db);const p=await add(request);
 for(const value of ['',null,'not-email','a@','@example.test','a b@example.test','a@example..test','a..b@example.test','a'.repeat(65)+'@example.test'])assert.equal((await provision(request,p,value)).status,400);
 assert.equal((await provision(request,p,'valid@example.test',{confirm_email:'different@example.test'})).status,400);
 assert.equal((await provision(request,p,'valid@example.test',{role:'administrator'})).status,400);
 assert.equal((await provision(request,p,'valid@example.test',{person_version:2})).status,409);
 db.prepare("UPDATE people SET deleted_at='removed' WHERE id=?").run(p.id);assert.equal((await provision(request,p)).status,409);assert.equal(audits(db),0);
});
test('Member denied every mutation without leaking account details; last usable Administrator protected',async t=>{
 const {db,request}=fixture(t);
 for(const path of ['/api/admin/accounts','/api/admin/accounts/local-account/disable','/api/admin/accounts/local-account/enable'])assert.deepEqual((await request(path,'POST',{})).data,{error:'Administrator access required.'});
 admin(db);let self=(await request('/api/admin/accounts/local-account')).data.item;
 assert.equal((await status(request,self,'disable')).status,409);assert.equal(audits(db),0);
 const p=await add(request);const other=(await provision(request,p)).data.item;db.prepare("UPDATE app_users SET role='administrator',status='active' WHERE id=?").run(other.id);
 assert.equal((await status(request,self,'disable')).status,409,'unbound admin is not usable');
 db.prepare("UPDATE user_identities SET subject='other-admin',bound_at=CURRENT_TIMESTAMP WHERE user_id=?").run(other.id);
 db.prepare("UPDATE people SET deleted_at='removed' WHERE id=?").run(p.id);assert.equal((await status(request,self,'disable')).status,409,'inactive person not usable');db.prepare('UPDATE people SET deleted_at=NULL WHERE id=?').run(p.id);
 assert.equal((await status(request,self,'disable')).status,200,'another usable admin permits self-disable');
 assert.equal((await request('/api/admin/accounts')).status,403);
});
test('actor revocation/demotion at transaction time aborts all mutations',async t=>{
 for(const change of ["role='member'","status='disabled'"]){
  const {db,DB,request}=fixture(t);admin(db);const p=await add(request);const original=DB.batch;
  DB.batch=async statements=>{db.exec('UPDATE app_users SET '+change+" WHERE id='local-account'");return original(statements);};
  assert.equal((await provision(request,p)).status,409);assert.equal(audits(db),0);assert.equal(db.prepare('SELECT count(*) n FROM app_users').get().n,1);
 }
});
test('audit failure rolls back provisioning, disable and enable including account revision',async t=>{
 const {db,request}=fixture(t);admin(db);const p=await add(request),q=await add(request);let item=(await provision(request,p)).data.item;
 const fail=()=>db.exec("CREATE TRIGGER fail_admin_audit BEFORE INSERT ON security_audit BEGIN SELECT RAISE(ABORT,'audit failed'); END");
 fail();assert.equal((await provision(request,q,'other@example.test')).status,500);assert.equal((await status(request,item,'disable')).status,500);
 assert.equal(db.prepare('SELECT version FROM app_users WHERE id=?').get(item.id).version,1);assert.equal(db.prepare('SELECT count(*) n FROM app_users').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM user_identities').get().n,2);
 db.exec('DROP TRIGGER fail_admin_audit');item=(await status(request,item,'disable')).data.item;fail();assert.equal((await status(request,item,'enable')).status,500);
 assert.equal(db.prepare('SELECT status FROM app_users WHERE id=?').get(item.id).status,'disabled');assert.equal(audits(db),2);
});
test('concurrent provisioning and status submissions commit once',async t=>{
 const {db,DB,request}=fixture(t);admin(db);const p=await add(request);
 // D1 serializes write batches; emulate that in this single SQLite connection.
 const original=DB.batch;let queue=Promise.resolve();DB.batch=statements=>{const result=queue.then(()=>original(statements));queue=result.catch(()=>{});return result;};
 const attempts=await Promise.all([provision(request,p),provision(request,p)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
 const item=attempts.find(r=>r.status===201).data.item;
 const changes=await Promise.all([status(request,item,'disable'),status(request,item,'disable')]);assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);assert.equal(audits(db),2);
});
test('first-use binding and disable races cannot reactivate a disabled account',async t=>{
 const {db,DB,request}=fixture(t);admin(db);const p=await add(request);let item=(await provision(request,p)).data.item;
 const original=DB.batch;let raced=false;
 DB.batch=async statements=>{if(!raced){raced=true;await resolveAccount(env({...DB,batch:original}),principal('new@example.test'));}return original(statements);};
 assert.equal((await status(request,item,'disable')).status,409,'activation changed version before disable transaction');
 DB.batch=original;item=(await request('/api/admin/accounts/'+item.id)).data.item;assert.equal((await status(request,item,'disable')).status,200);
 const q=await add(request);const second=(await provision(request,q,'second@example.test')).data.item;raced=false;
 DB.batch=async statements=>{if(!raced){raced=true;assert.equal((await status(request,second,'disable')).status,200);}return original(statements);};
 assert.equal((await resolveAccount(env(DB),principal('second@example.test'))).status,'disabled');
 assert.equal(db.prepare('SELECT subject FROM user_identities WHERE user_id=?').get(second.id).subject,null);
});

test('status writes recheck revoked actor; enable rejects inactive person and missing identity',async t=>{
 for(const operation of ['disable','enable']) {
  const {db,DB,request}=fixture(t);admin(db);const p=await add(request);let item=(await provision(request,p)).data.item;
  if(operation==='enable')item=(await status(request,item,'disable')).data.item;
  const before=audits(db),original=DB.batch;
  DB.batch=async statements=>{db.exec("UPDATE app_users SET status='disabled' WHERE id='local-account'");return original(statements);};
  assert.equal((await status(request,item,operation)).status,409);assert.equal(audits(db),before);
  assert.equal(db.prepare('SELECT version FROM app_users WHERE id=?').get(item.id).version,item.version);
 }
 const {db,request}=fixture(t);admin(db);const p=await add(request);let item=(await provision(request,p)).data.item;item=(await status(request,item,'disable')).data.item;
 db.prepare("UPDATE people SET deleted_at='removed' WHERE id=?").run(p.id);assert.equal((await status(request,item,'enable')).status,409);
 db.prepare('UPDATE people SET deleted_at=NULL WHERE id=?').run(p.id);db.prepare('DELETE FROM user_identities WHERE user_id=?').run(item.id);assert.equal((await status(request,item,'enable')).status,409);
});
