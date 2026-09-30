import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import {resolveAccount} from '../src/api/shared/accounts.js';
import {mutateAccount} from '../src/api/admin/mutations.js';
const env=DB=>({DB,ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com'});
const principal=email=>({id:'subject-'+email,email,local:false});
const admin=db=>db.exec("UPDATE app_users SET role='administrator' WHERE id='local-account'");
const get=async(request,id)=>(await request('/api/admin/accounts/'+id)).data.item;
const change=(request,item,operation,body)=>request('/api/admin/accounts/'+item.id+'/'+operation,'POST',{version:item.version,...body});
const replace=(request,item,email)=>change(request,item,'identity',{login_email:email,confirm_email:email});
async function provision(request,email='new@example.test'){
 const person=(await request('/api/directory/people','POST',{first_name:'Synthetic'})).data.item;
 const r=await request('/api/admin/accounts','POST',{person_id:person.id,person_version:person.version,login_email:email,confirm_email:email});assert.equal(r.status,201);return r.data.item;
}
const snapshot=db=>JSON.stringify(['app_users','user_identities','security_audit'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));

test('separate role promotion/demotion preserves status; audit is limited and display sanitized',async t=>{
 const {db,request}=fixture(t);admin(db);let item=await provision(request);
 let r=await change(request,item,'role',{role:'administrator'});assert.equal(r.status,200);item=r.data.item;assert.equal(item.role,'administrator');assert.equal(item.status,'pending');assert.equal(item.version,2);
 r=await change(request,item,'role',{role:'member'});assert.equal(r.status,200);assert.equal(r.data.item.role,'member');assert.equal(r.data.item.version,3);
 assert.equal((await change(request,item,'role',{role:'member'})).status,409);
 assert.equal((await change(request,r.data.item,'role',{role:'owner'})).status,400);
 const audits=db.prepare("SELECT details FROM security_audit WHERE action='account.role' ORDER BY rowid").all().map(r=>JSON.parse(r.details));
 assert.deepEqual(audits,[{old_role:'member',new_role:'administrator'},{old_role:'administrator',new_role:'member'}]);
 const display=(await request('/api/admin/security-audit')).data;assert.ok(display.items.some(r=>r.change==='Member → Administrator'&&r.target==='Synthetic'));assert.ok(!JSON.stringify(display).includes('subject'));
 assert.equal((await get(request,'local-account')).is_self,true);assert.equal(r.data.item.is_self,false);
});

test('last usable Administrator excludes pending, unbound, disabled and inactive-person accounts',async t=>{
 const {db,request}=fixture(t);admin(db);const self=await get(request,'local-account');let other=await provision(request);
 db.prepare("UPDATE app_users SET role='administrator' WHERE id=?").run(other.id);
 for(const state of ['pending','disabled','active']){
  db.prepare('UPDATE app_users SET status=? WHERE id=?').run(state,other.id);
  assert.equal((await change(request,self,'role',{role:'member'})).status,409);
 }
 db.prepare("UPDATE user_identities SET subject='other',bound_at=CURRENT_TIMESTAMP WHERE user_id=?").run(other.id);
 for(const state of ['pending','disabled']){
  db.prepare('UPDATE app_users SET status=? WHERE id=?').run(state,other.id);assert.equal((await change(request,self,'role',{role:'member'})).status,409);
 }
 db.prepare("UPDATE app_users SET status='active' WHERE id=?").run(other.id);
 db.prepare("UPDATE people SET deleted_at='deleted' WHERE id=?").run(other.person_id);assert.equal((await change(request,self,'role',{role:'member'})).status,409);
 db.prepare('UPDATE people SET deleted_at=NULL WHERE id=?').run(other.person_id);assert.equal((await change(request,self,'role',{role:'member'})).status,200);
 assert.equal((await request('/api/admin/accounts')).status,403);
});

test('bound identity replacement stops old access, preserves person link, activates only approved new email',async t=>{
 const {db,DB,request}=fixture(t);admin(db);let item=await provision(request);await resolveAccount(env(DB),principal('new@example.test'));item=await get(request,item.id);
 const r=await replace(request,item,' REPLACED@Example.Test ');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.item.status,'pending');assert.equal(r.data.item.identity_state,'awaiting_first_sign_in');assert.equal(r.data.item.version,item.version+1);assert.equal(r.data.item.person_id,item.person_id);
 assert.equal(db.prepare('SELECT subject FROM user_identities WHERE user_id=?').get(item.id).subject,null);
 assert.equal((await resolveAccount(env(DB),principal('new@example.test'))).status,'unprovisioned');
 assert.equal((await resolveAccount(env(DB),principal('replaced@example.test'))).status,'resolved');
 const after=await get(request,item.id);assert.equal(after.version,item.version+2);
 const audit=JSON.parse(db.prepare("SELECT details FROM security_audit WHERE action='account.identity'").get().details);
 assert.deepEqual(audit,{old_email:'new@example.test',new_email:'replaced@example.test',old_status:'active',new_status:'pending'});
 const display=(await request('/api/admin/security-audit')).data;assert.ok(display.items.some(r=>r.change==='new@example.test → replaced@example.test'));
});

test('disabled identity replacement stays disabled, reserves emails, rejects duplicates and self-replacement',async t=>{
 const {db,DB,request}=fixture(t);admin(db);let item=await provision(request);item=(await change(request,item,'disable',{})).data.item;
 const r=await replace(request,item,'replacement@example.test');assert.equal(r.status,200);assert.equal(r.data.item.status,'disabled');assert.equal((await resolveAccount(env(DB),principal('replacement@example.test'))).status,'disabled');
 const other=await provision(request,'other@example.test');const before=snapshot(db);
 assert.equal((await replace(request,other,' REPLACEMENT@example.test ')).status,409);
 assert.equal((await replace(request,await get(request,'local-account'),'self@example.test')).status,403);
 assert.equal((await replace(request,other,'other@example.test')).status,409);
 assert.equal((await replace(request,other,'invalid')).status,400);
 assert.equal((await change(request,other,'identity',{login_email:'valid@example.test',confirm_email:'wrong@example.test'})).status,400);
 assert.equal((await change(request,other,'identity',{login_email:'valid@example.test',confirm_email:'valid@example.test',subject:'forbidden'})).status,400);
 assert.equal(snapshot(db),before);
});

test('role and identity operations deny Members before target information is read',async t=>{
 const {DB,request}=fixture(t);const original=DB.prepare;let queries=[];DB.prepare=sql=>{queries.push(sql);return original(sql);};
 for(const operation of ['role','identity']){queries=[];const r=await request('/api/admin/accounts/unknown/'+operation,'POST',{});assert.equal(r.status,403);assert.deepEqual(r.data,{error:'Administrator access required.'});assert.equal(queries.length,1);}
});

test('audit failure rolls back both mutations; stale/missing targets never succeed',async t=>{
 const {db,request}=fixture(t);admin(db);const item=await provision(request);
 db.exec("CREATE TRIGGER fail_changes BEFORE INSERT ON security_audit WHEN NEW.action IN ('account.role','account.identity') BEGIN SELECT RAISE(ABORT,'audit failed'); END");const before=snapshot(db);
 assert.equal((await change(request,item,'role',{role:'administrator'})).status,500);assert.equal((await replace(request,item,'next@example.test')).status,500);assert.equal(snapshot(db),before);
 db.exec('DROP TRIGGER fail_changes');const updated=(await change(request,item,'role',{role:'administrator'})).data.item;
 assert.equal((await replace(request,item,'next@example.test')).status,409);assert.equal((await change(request,{...updated,id:'missing'},'role',{role:'member'})).status,409);
 assert.equal((await replace(request,{...updated,id:'missing'},'next@example.test')).status,409);
});

test('actor demotion/revocation between request and transaction aborts role and identity changes',async t=>{
 for(const operation of ['role','identity'])for(const state of ["role='member'","status='disabled'"]){
  const {db,DB,request}=fixture(t);admin(db);const item=await provision(request),original=DB.batch;
  DB.batch=async statements=>{db.exec('UPDATE app_users SET '+state+" WHERE id='local-account'");return original(statements);};
  const r=operation==='role'?await change(request,item,operation,{role:'administrator'}):await replace(request,item,'next@example.test');assert.equal(r.status,409);
  assert.equal(db.prepare('SELECT version FROM app_users WHERE id=?').get(item.id).version,item.version);assert.equal(db.prepare("SELECT count(*) n FROM security_audit WHERE action<>'account.provision'").get().n,0);
 }
});

test('binding increments active/unbound revision exactly once and wins against stale replacement',async t=>{
 const {db,DB,request}=fixture(t);admin(db);let item=await provision(request);db.prepare("UPDATE app_users SET status='active' WHERE id=?").run(item.id);
 const original=DB.batch;let raced=false;
 DB.batch=async statements=>{if(!raced){raced=true;await resolveAccount(env({...DB,batch:original}),principal('new@example.test'));}return original(statements);};
 assert.equal((await replace(request,item,'next@example.test')).status,409);DB.batch=original;
 await resolveAccount(env(DB),principal('new@example.test'));item=await get(request,item.id);assert.equal(item.version,2);
 assert.equal(db.prepare("SELECT count(*) n FROM security_audit WHERE action='identity.bind'").get().n,1);
});

test('replacement wins against in-flight old-email binding without identity transfer',async t=>{
 const {db,DB,request}=fixture(t);admin(db);const item=await provision(request),original=DB.batch;let raced=false;
 DB.batch=async statements=>{if(!raced){raced=true;assert.equal((await replace(request,item,'next@example.test')).status,200);}return original(statements);};
 assert.equal((await resolveAccount(env(DB),principal('new@example.test'))).status,'unprovisioned');DB.batch=original;
 assert.equal(db.prepare('SELECT subject FROM user_identities WHERE user_id=?').get(item.id).subject,null);assert.equal((await get(request,item.id)).version,2);
 assert.equal((await resolveAccount(env(DB),principal('next@example.test'))).status,'resolved');assert.equal((await get(request,item.id)).version,3);
});

test('concurrent Administrator demotion/disable retains one usable Administrator',async t=>{
 for(const operation of ['role','disable']){
  const {db,DB,request}=fixture(t);admin(db);let other=await provision(request);await resolveAccount(env(DB),principal('new@example.test'));other=await get(request,other.id);other=(await change(request,other,'role',{role:'administrator'})).data.item;
  const self=await get(request,'local-account');const member1={id:'local-development',email:'family@localhost',account:{id:self.id,role:'administrator'}};
  const member2={...principal('new@example.test'),account:{id:other.id,role:'administrator'}};
  const original=DB.batch;let queue=Promise.resolve();DB.batch=statements=>{const result=queue.then(()=>original(statements));queue=result.catch(()=>{});return result;};
  const call=(member,item,op)=>mutateAccount(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:item.version,...(op==='role'?{role:'member'}:{})})}),env(DB),member,item.id,op);
  const results=await Promise.allSettled([call(member1,self,'role'),call(member2,other,operation)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  assert.equal(db.prepare("SELECT count(*) n FROM app_users WHERE role='administrator' AND status='active'").get().n,1);
 }
});
