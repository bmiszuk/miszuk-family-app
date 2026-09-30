import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import {localPerson} from './account-fixture.mjs';
const paths=['/api/admin/accounts','/api/admin/accounts/local-account','/api/admin/security-audit'];
test('Member denial precedes account/audit queries; read-only methods and Phase 3 gate remain enforced',async t=>{
 const {db,DB,request}=fixture(t);const original=DB.prepare;const queries=[];
 DB.prepare=sql=>{queries.push(sql);return original(sql);};
 for(const path of paths){queries.length=0;const r=await request(path);assert.equal(r.status,403);assert.deepEqual(r.data,{error:'Administrator access required.'});assert.equal(queries.length,1);}
 db.exec("UPDATE app_users SET role='administrator'");
 for(const method of ['PATCH','DELETE'])for(const path of paths)assert.equal((await request(path,method,{})).status,405);
 db.exec("UPDATE app_users SET status='disabled'");for(const path of paths)assert.equal((await request(path)).data.code,'APPLICATION_ACCESS_DENIED');
});
test('sanitized accounts distinguish no access, roles, approved email, binding and lifecycle states',async t=>{
 const {db,request}=fixture(t);db.exec("UPDATE app_users SET role='administrator'; UPDATE people SET login_email='legacy-not-approved@example.test'");
 const self=(await request('/api/admin/accounts/local-account')).data.item;
 assert.deepEqual(Object.keys(self).sort(),['is_self','id','person_id','name','status','role','version','approved_email','identity_state','household'].sort());
 assert.equal(self.approved_email,'family@localhost');assert.equal(self.identity_state,'bound');assert.equal(self.role,'administrator');
 assert.ok(!(JSON.stringify(self).includes('local-development')));assert.ok(!(JSON.stringify(self).includes('legacy-not-approved')));
 const added=(await request('/api/directory/people','POST',{first_name:'No account'})).data.item;
 db.prepare('UPDATE people SET login_email=? WHERE id=?').run('never-infer@example.test',added.id);
 assert.deepEqual((await request('/api/admin/accounts?person_id='+added.id)).data.items,[]);
 db.prepare("INSERT INTO app_users(id,person_id,status,role) VALUES('other',?,'pending','member')").run(added.id);
 db.exec("INSERT INTO user_identities(id,user_id,provider,issuer,login_email) VALUES('other-identity','other','cloudflare_access','https://test.cloudflareaccess.com','approved@example.test')");
 let item=(await request('/api/admin/accounts/other')).data.item;
 assert.equal(item.status,'pending');assert.equal(item.identity_state,'awaiting_first_sign_in');assert.equal(item.household,null);
 db.exec("UPDATE app_users SET status='disabled' WHERE id='other'");item=(await request('/api/admin/accounts/other')).data.item;assert.equal(item.status,'disabled');
 db.exec("UPDATE app_users SET status='active' WHERE id='other'; UPDATE user_identities SET subject='private-subject',bound_at=CURRENT_TIMESTAMP WHERE id='other-identity'");
 item=(await request('/api/admin/accounts/other')).data.item;assert.equal(item.status,'active');assert.equal(item.identity_state,'bound');assert.ok(!JSON.stringify(item).includes('private-subject'));
 assert.equal((await request('/api/admin/accounts/missing')).status,404);
 const page=(await request('/api/admin/accounts?limit=1')).data;assert.equal(page.items.length,1);assert.equal(page.next_offset,1);
 const next=(await request('/api/admin/accounts?limit=1&offset=1')).data;assert.equal(next.next_offset,null);assert.notEqual(next.items[0].id,page.items[0].id);
 assert.equal((await request('/api/admin/accounts?person_id='+localPerson)).data.items.length,1);
});
test('bounded audit pages allowlist display fields and redact raw details, targets and actor labels',async t=>{
 const {db,request}=fixture(t);db.exec("UPDATE app_users SET role='administrator'");
 const insert=db.prepare("INSERT INTO security_audit(id,actor_type,actor_label,action,target_type,target_id,details,occurred_at) VALUES(?,'operator','SECRET OPERATOR',?,'user_identity','SECRET TARGET','{\"token\":\"SECRET TOKEN\"}',?)");
 for(let i=0;i<53;i++)insert.run('audit-'+String(i).padStart(3,'0'),i===52?'unknown SECRET ACTION':'identity.bind','2026-09-29 12:00:00');
 const first=await request('/api/admin/security-audit?limit=50');assert.equal(first.status,200);assert.equal(first.data.items.length,50);assert.equal(first.data.next_offset,50);
 assert.deepEqual(Object.keys(first.data.items[0]).sort(),['occurred_at','action','actor'].sort());assert.ok(!JSON.stringify(first.data).includes('SECRET'));assert.equal(first.data.items[0].action,'Security change recorded');
 const last=(await request('/api/admin/security-audit?limit=50&offset=50')).data;assert.equal(last.items.length,3);assert.equal(last.next_offset,null);
 for(const query of ['limit=0','limit=51','limit=-1','offset=-1','offset=100001','limit=abc','offset=1.5'])for(const path of ['/api/admin/accounts','/api/admin/security-audit'])assert.equal((await request(path+'?'+query)).status,400);
 assert.equal((await request('/api/admin/accounts?person_id=invalid')).status,400);
 assert.match(first.headers.get('Cache-Control'),/no-store/);
 assert.equal(db.prepare('SELECT count(*) n FROM security_audit').get().n,53,'reads never write audits');
});
