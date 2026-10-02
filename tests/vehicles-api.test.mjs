import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import {defaultHousehold,localPerson} from './account-fixture.mjs';
import {createVehicle} from '../src/api/vehicles/service.js';
const car={year:2017,make:'Toyota',model:'Camry',current_mileage:1000};
async function create(f){const r=await f.request('/api/vehicles','POST',car);assert.equal(r.status,201);return r.data.item;}
function outsider(f){
 const home=crypto.randomUUID(),person=crypto.randomUUID(),account=crypto.randomUUID();
 f.db.prepare('INSERT INTO households(id,name) VALUES(?,?)').run(home,'Other household');
 f.db.prepare('INSERT INTO people(id,family_id,first_name,household_id) VALUES(?,?,?,?)').run(person,'existing','Outsider',home);
 f.db.prepare("INSERT INTO app_users(id,person_id,status,role) VALUES(?,?,'active','member')").run(account,person);
 f.db.prepare("INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES(?,?,'cloudflare_access','https://test.cloudflareaccess.com',?,?,CURRENT_TIMESTAMP)").run(crypto.randomUUID(),account,'outsider@example.test','outside');
 return {home,person,user:{id:'outside',account:{id:account,role:'member'},person:{id:person,first_name:'Outsider'},household:{id:home}}};
}
test('Vehicles API supports sanitized CRUD, maintenance, Sold/Inactive and explicit mileage correction',async t=>{
 const f=fixture(t),v=await create(f);
 assert.equal(v.household_id,defaultHousehold);assert.equal((await f.request('/api/vehicles')).data.items.length,1);
 assert.equal((await f.request('/api/vehicles/'+v.id)).data.item.current_mileage,1000);
 for(const key of ['created_by_user_id','updated_by_user_id','created_at','updated_at','deleted_at'])assert.ok(!(key in v));
 const entry=await f.request('/api/vehicles/'+v.id+'/maintenance','POST',{vehicle_version:1,description:'Oil change',mileage:1200,category:null,total_cost_cents:3499});assert.equal(entry.status,201);
 let rows=(await f.request('/api/vehicles/'+v.id+'/maintenance')).data.items;
 assert.equal(rows[0].performed_by,'Local');assert.equal(rows[0].category,null);assert.equal(rows[0].total_cost_cents,3499);
 assert.ok(!JSON.stringify(rows).includes('local-account'));assert.ok(!JSON.stringify(rows).includes('local-development'));
 const route='/api/vehicles/'+v.id+'/maintenance/'+entry.data.id;
 assert.equal((await f.request(route,'PATCH',{vehicle_version:2,version:1,performed_by:'Woodhouse',category:'Oil & Filter',mileage:1100})).status,200);
 assert.equal(f.db.prepare('SELECT created_by_user_id,updated_by_user_id FROM vehicle_maintenance').get().created_by_user_id,'local-account');
 assert.equal((await f.request('/api/vehicles/'+v.id)).data.item.current_mileage,1200);
 assert.equal((await f.request(route,'DELETE',{vehicle_version:3,version:2})).status,200);
 assert.deepEqual((await f.request('/api/vehicles/'+v.id+'/maintenance')).data.items,[]);
 assert.ok(f.db.prepare('SELECT deleted_at FROM vehicle_maintenance').get().deleted_at);
 assert.equal((await f.request('/api/vehicles/'+v.id,'PATCH',{version:4,status:'sold_inactive'})).status,200);
 assert.equal((await f.request('/api/vehicles/'+v.id,'DELETE',{version:5})).status,405);
 assert.equal((await f.request('/api/vehicles/'+v.id,'PATCH',{version:5,current_mileage:900})).status,400);
 assert.equal((await f.request('/api/vehicles/'+v.id+'/mileage','POST',{version:5,current_mileage:900,reason:'Correct odometer entry'})).status,200);
 assert.equal((await f.request('/api/vehicles/'+v.id)).data.item.current_mileage,900);
 assert.equal(f.db.prepare("SELECT count(*) n FROM security_audit WHERE action='vehicle.mileage.correct'").get().n,1);
});
test('every Vehicles operation denies other households; explicit Administrator correction permits but audits',async t=>{
 const f=fixture(t),other=outsider(f),v=await createVehicle(f.DB,other.user,other.home,car),base='/api/vehicles/'+v.id;
 for(const [path,method,body] of [[base,'GET'],[base,'PATCH',{version:1,notes:'Denied'}],[base+'/mileage','POST',{version:1,current_mileage:900,reason:'Denied'}],[base+'/maintenance','GET'],[base+'/maintenance','POST',{vehicle_version:1,description:'Denied'}],[base+'/maintenance/'+crypto.randomUUID(),'PATCH',{vehicle_version:1,version:1,description:'Denied'}],[base+'/maintenance/'+crypto.randomUUID(),'DELETE',{vehicle_version:1,version:1}]]){
  const r=await f.request(path,method,body);assert.equal(r.status,403,path);assert.deepEqual(Object.keys(r.data),['error']);
 }
 assert.deepEqual((await f.request('/api/vehicles')).data.items,[]);
 const select='?administration=true&household_id='+other.home;
 assert.equal((await f.request('/api/vehicles'+select)).status,403);
 assert.equal((await f.request('/api/vehicles?household_id='+defaultHousehold)).status,403);
 assert.ok(!(await f.request('/api/vehicles/people')).data.items.some(p=>p.id===other.person));
 f.db.exec("UPDATE app_users SET role='administrator' WHERE id='local-account'");
 assert.equal((await f.request(base)).status,403,'Administrator still needs explicit mode');
 assert.equal((await f.request('/api/vehicles'+select)).data.items[0].id,v.id);
 const drivers=(await f.request('/api/vehicles/people'+select)).data.items;assert.equal(drivers[0].id,other.person);assert.deepEqual(Object.keys(drivers[0]).sort(),['first_name','id','last_name']);
 assert.equal((await f.request(base+select,'PATCH',{version:1,notes:'Correction'})).status,200);
 assert.equal(f.db.prepare("SELECT action FROM security_audit").get().action,'vehicle.correctAny');
 assert.equal((await f.request(base+'/maintenance'+select,'POST',{vehicle_version:2,description:'Invalid',category:'Unapproved'})).status,400);
});
test('Vehicles payloads cannot supply identity/household metadata; validation, revisions and categories are enforced',async t=>{
 const f=fixture(t),v=await create(f),base='/api/vehicles/'+v.id;
 for(const extra of [{household_id:defaultHousehold},{created_by_user_id:'admin'},{account:{role:'administrator'}},{primary_driver_id:'not-a-person'},{oil_filter_references:[{brand:'Wix',part_number:'123',household_id:'other'}]}])assert.notEqual((await f.request('/api/vehicles','POST',{...car,...extra})).status,201);
 for(const body of [{version:1,household_id:'other'},{version:1,updated_by_user_id:'other'},{version:'1',notes:'No'},{version:1,purchase_date:'2026-02-30'}])assert.equal((await f.request(base,'PATCH',body)).status,400);
 for(const body of [{category:'Custom'},{mileage:-1},{total_cost_cents:1.25},{service_date:'2026-02-30'},{description:''},{created_by_user_id:'other'},{performed_by:123}])assert.equal((await f.request(base+'/maintenance','POST',{vehicle_version:1,description:'Service',...body})).status,400);
 assert.equal((await f.request(base+'/maintenance','POST',{vehicle_version:1,description:'Check',category:''})).status,201);
 assert.equal((await f.request(base+'/maintenance','POST',{vehicle_version:1,description:'Stale'})).status,409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_maintenance').get().n,1);
 assert.equal((await f.request(base+'/mileage','POST',{version:2,current_mileage:800,reason:''})).status,400);
 assert.equal((await f.request(base+'/mileage','POST',{version:2,reason:'Must be explicit'})).status,400);
 assert.equal((await f.request(base+'/mileage','POST',{version:2,current_mileage:null,reason:'Unknown mileage'})).status,200);
 assert.equal((await f.request(base)).data.item.current_mileage,null);
});
test('Vehicles lists/history are bounded and no-household members receive no data',async t=>{
 const f=fixture(t),v=await create(f);
 for(let i=0;i<51;i++)f.db.prepare('INSERT INTO vehicle_maintenance(id,vehicle_id,service_date,description,created_by_user_id,updated_by_user_id) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),v.id,'2026-10-01','Service '+i,'local-account','local-account');
 const first=await f.request('/api/vehicles/'+v.id+'/maintenance');assert.equal(first.data.items.length,50);assert.equal(first.data.next_offset,50);
 assert.equal((await f.request('/api/vehicles/'+v.id+'/maintenance?offset=50')).data.items.length,1);
 for(const suffix of ['?offset=-1','?offset=1.5','?offset=100001','?administration=maybe'])assert.equal((await f.request('/api/vehicles'+suffix)).status,400);
 f.db.prepare('UPDATE people SET household_id=NULL WHERE id=?').run(localPerson);
 for(const path of ['/api/vehicles','/api/vehicles/people','/api/vehicles/'+v.id])assert.equal((await f.request(path)).data.code,'HOUSEHOLD_REQUIRED');
});
