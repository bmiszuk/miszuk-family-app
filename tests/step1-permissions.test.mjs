import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import {localPerson,defaultHousehold} from './account-fixture.mjs';
const admin=db=>db.exec("UPDATE app_users SET role='administrator'");
const member=db=>db.exec("UPDATE app_users SET role='member'");
const person=(db,id)=>db.prepare('SELECT * FROM people WHERE id=?').get(id);
async function add(request,name='Other'){const r=await request('/api/directory/people','POST',{first_name:name});assert.equal(r.status,201);return r.data.item;}
const patch=(request,p,extra={})=>request('/api/directory/people/'+p.id,'PATCH',{...p,last_name:p.last_name||'',...extra});
const auditCount=db=>db.prepare('SELECT count(*) n FROM security_audit').get().n;

test('Member cannot smuggle household or relationships through direct, nested, or creation writes',async t=>{
 const {db,request}=fixture(t);const other=await add(request);
 const self=person(db,localPerson);
 for(const body of [{household_id:null},{relationships:[{relationship_type:'spouse',person1_id:localPerson,person2_id:other.id}],relationship_versions:[]}]) {
  const r=await patch(request,self,{...body,first_name:'Must not save'});assert.equal(r.status,403);
  assert.equal(person(db,localPerson).first_name,'Local');assert.equal(auditCount(db),0);
 }
 for(const body of [{household_id:defaultHousehold},{relationships:[{relationship_type:'parent',person1_id:localPerson,person2_id:'self'}]}]) {
  assert.equal((await request('/api/directory/people','POST',{first_name:'Forbidden',...body})).status,403);
 }
 assert.equal(db.prepare("SELECT count(*) n FROM people WHERE first_name='Forbidden'").get().n,0);
 assert.equal((await request('/api/directory/relationships','POST',{person1_id:localPerson,person2_id:other.id,relationship_type:'spouse'})).status,403);
 for(const [path,method,body] of [['/api/households','POST',{name:'Denied'}],['/api/households/'+defaultHousehold,'PATCH',{name:'Denied'}],['/api/households/'+defaultHousehold,'DELETE',{}]])assert.equal((await request(path,method,body)).status,403);
 assert.equal((await request('/api/households')).status,200);
});

test('Administrator manages links/households; Members preserve unchanged sensitive values and anniversary edits',async t=>{
 const {db,request}=fixture(t);admin(db);const other=await add(request);
 const home=(await request('/api/households','POST',{name:'Test home'})).data.item;
 let self=person(db,localPerson);
 assert.equal((await patch(request,self,{household_id:home.id})).status,200);
 const link=(await request('/api/directory/relationships','POST',{person1_id:localPerson,person2_id:other.id,relationship_type:'spouse',anniversary_date:'06-01'})).data.item;
 assert.ok(link.id);member(db);self=person(db,localPerson);
 let saved=await patch(request,self,{first_name:'Member edit',relationships:[link],relationship_versions:[link.id+':1']});assert.equal(saved.status,200);
 saved=await patch(request,saved.data.item,{relationships:[{...link,anniversary_date:'06-02'}],relationship_versions:[link.id+':1']});assert.equal(saved.status,200);
 const currentLink=db.prepare('SELECT * FROM relationships WHERE id=?').get(link.id);
 assert.equal((await patch(request,saved.data.item,{first_name:'Forbidden',relationships:[],relationship_versions:[link.id+':2']})).status,403);
 assert.equal(person(db,localPerson).first_name,'Member edit');
 assert.equal((await request('/api/directory/relationships/'+link.id,'DELETE',{version:2})).status,403);
 admin(db);
 assert.equal((await request('/api/directory/relationships/'+link.id,'DELETE',{version:currentLink.version})).status,200);
 assert.equal((await patch(request,person(db,localPerson),{household_id:null})).status,200);
 assert.equal((await request('/api/households/'+home.id,'PATCH',{name:'Renamed',expected_name:'Test home'})).status,200);
 assert.equal((await request('/api/households/'+home.id,'PATCH',{name:'Stale',expected_name:'Test home'})).status,409);
 assert.equal((await request('/api/households/'+home.id,'DELETE',{expected_name:'Renamed'})).status,200);
 const actions=db.prepare('SELECT action FROM security_audit').all().map(r=>r.action);
 for(const action of ['household.create','household.rename','household.retire','directory.household.assign','directory.relationship.create','directory.relationship.remove'])assert.ok(actions.includes(action),action);
 assert.equal((await request('/api/me')).data.member.household,null);
 assert.equal((await request('/api/groceries')).status,403);
});

test('explicit Administrator profile override audits corrections and preserves linked-person deletion guard',async t=>{
 const {db,request}=fixture(t);const other=await add(request);
 assert.equal((await patch(request,other,{first_name:'Denied'})).status,403);admin(db);
 const saved=await patch(request,other,{first_name:'Corrected'});assert.equal(saved.status,200);
 assert.equal(db.prepare("SELECT count(*) n FROM security_audit WHERE action='directory.profile.editAny'").get().n,1);
 assert.equal((await patch(request,other,{first_name:'Stale'})).status,409);
 assert.equal(auditCount(db),1);
 assert.equal((await request('/api/directory/people/'+localPerson,'DELETE',{version:1})).status,409);
});

test('audit failure rolls back all privileged writes, including nested person creation',async t=>{
 const {db,request}=fixture(t);admin(db);const other=await add(request);
 db.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON security_audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
 assert.equal((await request('/api/households','POST',{name:'Rollback'})).status,500);
 assert.equal((await patch(request,other,{first_name:'Rollback'})).status,500);
 assert.equal((await patch(request,person(db,localPerson),{household_id:null})).status,500);
 assert.equal((await request('/api/directory/relationships','POST',{person1_id:localPerson,person2_id:other.id,relationship_type:'spouse'})).status,500);
 assert.equal((await request('/api/directory/people','POST',{first_name:'Rollback',household_id:defaultHousehold,relationships:[{relationship_type:'parent',person1_id:localPerson,person2_id:'self'}]})).status,500);
 assert.equal(person(db,other.id).first_name,'Other');assert.equal(person(db,localPerson).household_id,defaultHousehold);
 assert.equal(db.prepare("SELECT count(*) n FROM people WHERE first_name='Rollback'").get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM households WHERE name='Rollback'").get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM relationships').get().n,0);assert.equal(auditCount(db),0);
});

test('transaction rechecks Administrator authority after request resolution',async t=>{
 const {db,request,DB}=fixture(t);admin(db);const original=DB.batch;
 DB.batch=async statements=>{member(db);return original(statements);};
 assert.equal((await request('/api/households','POST',{name:'Revoked'})).status,409);
 assert.equal(auditCount(db),0);assert.equal(db.prepare("SELECT count(*) n FROM households WHERE name='Revoked'").get().n,0);
});

test('Administrator nested operations remain atomic under relationship integrity failures',async t=>{
 const {db,request}=fixture(t);admin(db);const a=await add(request,'A'),b=await add(request,'B');
 const marriage=(await request('/api/directory/relationships','POST',{person1_id:a.id,person2_id:b.id,relationship_type:'spouse'})).data.item;
 const before=auditCount(db);
 const r=await patch(request,person(db,localPerson),{first_name:'Rollback',household_id:null,relationship_versions:[],relationships:[{relationship_type:'spouse',person1_id:localPerson,person2_id:b.id}]});
 assert.equal(r.status,409);assert.equal(person(db,localPerson).first_name,'Local');assert.equal(person(db,localPerson).household_id,defaultHousehold);assert.equal(auditCount(db),before);
 assert.equal((await request('/api/directory/relationships/'+marriage.id,'PATCH',{version:1,anniversary_date:'07-01'})).status,200);
 assert.equal(db.prepare("SELECT count(*) n FROM security_audit WHERE action='directory.anniversary.editAny'").get().n,1);
 assert.equal((await request('/api/households/'+defaultHousehold,'DELETE',{expected_name:'Default household'})).status,409);
});

