import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './permission-fixture.mjs';
import {defaultHousehold,localPerson} from './account-fixture.mjs';
import {can} from '../src/api/shared/permissions.js';
import {vehicleValues,maintenanceValues,maintenanceCategories,advanceMileage} from '../src/domain/vehicles.js';
import {createVehicle,getVehicle,listVehicles,updateVehicle,correctVehicleMileage,createMaintenance,listMaintenance,updateMaintenance,deleteMaintenance} from '../src/api/vehicles/service.js';
const migration=readFileSync(new URL('../migrations/0012_vehicles.sql',import.meta.url),'utf8');
const input={year:2018,make:'Honda',model:'Accord'};
function setup(t){
 const f=fixture(t);
 // D1 serializes transactions; match it for concurrent synthetic requests.
 const batch=f.DB.batch.bind(f.DB);let queue=Promise.resolve();
 f.DB.batch=statements=>{const result=queue.then(()=>batch(statements));queue=result.catch(()=>{});return result;};
 f.db.exec("INSERT INTO households(id,name) VALUES('other-home','Other home')");
 function actor(id,household=defaultHousehold,role='member'){
  f.db.prepare('INSERT INTO people(id,family_id,first_name,household_id) VALUES(?,?,?,?)').run('person-'+id,'existing',id,household);
  f.db.prepare("INSERT INTO app_users(id,person_id,status,role) VALUES(?,?,'active',?)").run(id,'person-'+id,role);
  f.db.prepare("INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES(?,?,'cloudflare_access','https://test.cloudflareaccess.com',?,?,CURRENT_TIMESTAMP)").run('identity-'+id,id,id+'@example.test','subject-'+id);
  return {id:'subject-'+id,account:{id,role},person:{id:'person-'+id,first_name:id,household_id:household},household:household?{id:household}:null};
 }
 const user={id:'local-development',account:{id:'local-account',role:'member'},person:{id:localPerson,first_name:'Local',household_id:defaultHousehold},household:{id:defaultHousehold}};
 return {...f,user,peer:actor('peer'),outsider:actor('outsider','other-home'),admin:actor('admin','other-home','administrator'),unassigned:actor('unassigned',null),actor};
}
const rejects=(promise,status)=>assert.rejects(promise,e=>e.status===status);

test('Vehicles migration is additive on existing data, has restrictive references and constrained categories/status/mileage',async t=>{
 const f=fixture(t);f.db.exec('DROP TRIGGER vehicle_driver_insert; DROP TRIGGER vehicle_driver_update; DROP TABLE vehicle_maintenance; DROP TABLE vehicles');
 const tables=f.db.prepare("SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const rows=Object.fromEntries(tables.filter(x=>x.sql?.startsWith('CREATE TABLE')).map(x=>[x.name,f.db.prepare('SELECT * FROM "'+x.name+'"').all()]));
 f.db.exec(migration);
 for(const entry of tables)assert.equal(f.db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(entry.name).sql,entry.sql);
 for(const [name,data] of Object.entries(rows))assert.deepEqual(f.db.prepare('SELECT * FROM "'+name+'"').all(),data);
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 for(const name of ['vehicles','vehicle_maintenance'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+name).get().n,0);
 const user={id:'local-development',account:{id:'local-account'},person:{id:localPerson,first_name:'Local'},household:{id:defaultHousehold}};
 const v=await createVehicle(f.DB,user,defaultHousehold,input);
 for(const [column,value] of [['current_mileage',-1],['current_mileage',1.5],['version',0],['status','deleted'],['oil_filter_references','{}'],['created_by_user_id','unknown']])assert.throws(()=>f.db.prepare('UPDATE vehicles SET '+column+'=? WHERE id=?').run(value,v.id));
 const m=await createMaintenance(f.DB,user,v.id,1,{description:'Check brakes'});
 assert.throws(()=>f.db.prepare("UPDATE vehicle_maintenance SET category='Custom' WHERE id=?").run(m.id));
 assert.throws(()=>f.db.prepare('UPDATE vehicle_maintenance SET total_cost_cents=-1 WHERE id=?').run(m.id));
 assert.throws(()=>f.db.prepare('DELETE FROM vehicles WHERE id=?').run(v.id));
 assert.throws(()=>f.db.prepare("DELETE FROM app_users WHERE id='local-account'").run());
});

test('pure Vehicles values support specifications, multiple filters, blank Category and editable performed-by',()=>{
 const v=vehicleValues({...input,trim:' EX ',vin:'ABC',license_plate:'123',purchase_date:'2020-02-29',purchase_mileage:12345,
  engine:'2.0L',oil_specification:'0W-20',oil_capacity:'5 qt',oil_filter_references:[{brand:'Honda',part_number:'A'},{brand:'Wix',part_number:'B'}],
  front_tire_size:'225/50R17',rear_tire_size:'225/50R17',front_tire_pressure:'32 PSI',rear_tire_pressure:'32 PSI',driver_wiper_size:'26 in',passenger_wiper_size:'18 in',rear_wiper_size:'',lug_nut_socket_size:'19 mm',notes:'Family car'});
 assert.equal(v.trim,'EX');assert.equal(v.oil_filter_references.length,2);assert.equal(v.current_mileage,null);
 const m=maintenanceValues({description:'Oil changed',category:''},{firstName:'Bob',today:'2026-10-01'});
 assert.equal(m.category,null);assert.equal(m.performed_by,'Bob');assert.equal(m.service_date,'2026-10-01');
 assert.equal(maintenanceValues({...m,performed_by:'Woodhouse',total_cost_cents:12345}).performed_by,'Woodhouse');
 assert.equal(maintenanceValues({...m,performed_by:''}).performed_by,'');
 for(const category of maintenanceCategories)assert.equal(maintenanceValues({...m,category}).category,category);
 assert.equal(maintenanceCategories.length,13);
 for(const body of [{category:'Custom'},{description:''},{service_date:'2026-02-30'},{mileage:-1},{total_cost_cents:12.5}])assert.throws(()=>maintenanceValues({...m,...body}));
 for(const body of [{year:1800},{purchase_date:'2026-02-30'},{current_mileage:NaN},{oil_filter_references:[{brand:'Wix'}]},{primary_driver_id:false}])assert.throws(()=>vehicleValues({...input,...body}));
 assert.equal(advanceMileage(100,90),100);assert.equal(advanceMileage(null,90),90);assert.equal(advanceMileage(100,null),100);
});

test('Vehicle policies are household-specific, explicit for Administrator, and do not inherit Directory relationships',async t=>{
 const f=setup(t),resource={household_id:defaultHousehold};
 const actions=['vehicle.read','vehicle.create','vehicle.update','vehicle.mileage.correct','vehicle.maintenance.create','vehicle.maintenance.update','vehicle.maintenance.delete'];
 const context={relationships:[{relationship_type:'spouse',person1_id:f.outsider.person.id,person2_id:localPerson},{relationship_type:'parent',person1_id:f.outsider.person.id,person2_id:localPerson}]};
 for(const action of actions){assert.equal(can(f.user,action,resource),true);assert.equal(can(f.outsider,action,resource,context),false);assert.equal(can(f.admin,action,resource),false);assert.equal(can(f.unassigned,action,resource),false);assert.equal(can(null,action,resource),false);}
 for(const action of ['vehicle.readAny','vehicle.correctAny']){assert.equal(can(f.admin,action,resource),true);assert.equal(can(f.user,action,resource),false);}
 assert.equal(can(f.admin,'vehicle.delete',resource),false);assert.equal(can(f.admin,'photos.access'),false);
 const v=await createVehicle(f.DB,f.user,defaultHousehold,input);
 assert.equal((await getVehicle(f.DB,f.peer,v.id)).id,v.id);
 await rejects(getVehicle(f.DB,f.outsider,v.id),403);await rejects(getVehicle(f.DB,f.admin,v.id),403);
 await rejects(listVehicles(f.DB,f.outsider,defaultHousehold),403);await rejects(listVehicles(f.DB,f.unassigned,null),403);
 await rejects(createVehicle(f.DB,f.outsider,defaultHousehold,input),403);
 await rejects(updateVehicle(f.DB,f.outsider,v.id,1,{notes:'Denied'}),403);
 await rejects(createMaintenance(f.DB,f.outsider,v.id,1,{description:'Denied'}),403);
 await rejects(getVehicle(f.DB,f.peer,v.id,{administration:true}),403);
 assert.equal((await getVehicle(f.DB,f.admin,v.id,{administration:true})).id,v.id);
 const corrected=await updateVehicle(f.DB,f.admin,v.id,1,{notes:'Correction'},{administration:true});
 assert.equal(corrected.notes,'Correction');assert.equal(corrected.updated_by_user_id,'admin');
 assert.equal(f.db.prepare("SELECT count(*) n FROM security_audit WHERE action='vehicle.correctAny'").get().n,1);
 const c=await createVehicle(f.DB,f.admin,defaultHousehold,{...input,model:'Civic'},{administration:true});assert.equal(c.household_id,defaultHousehold);
});

test('Vehicle records persist every Phase 1 field and driver must be an active person in the target household',async t=>{
 const f=setup(t);const fields={...input,primary_driver_id:f.peer.person.id,trim:'EX',vin:'VIN',license_plate:'ABC',purchase_date:'2020-01-01',purchase_mileage:10000,
  current_mileage:12000,engine:'2.0L',oil_specification:'0W-20',oil_capacity:'5 qt',oil_filter_references:[{brand:'Wix',part_number:'123'}],front_tire_size:'A',rear_tire_size:'B',front_tire_pressure:'32 PSI',rear_tire_pressure:'30 PSI',driver_wiper_size:'26',passenger_wiper_size:'18',rear_wiper_size:'12',lug_nut_socket_size:'19 mm',notes:'Notes'};
 let v=await createVehicle(f.DB,f.user,defaultHousehold,fields);
 for(const [key,value] of Object.entries(fields))assert.deepEqual(v[key],value,key);
 assert.equal(v.created_by_user_id,'local-account');assert.equal(v.updated_by_user_id,'local-account');
 await rejects(createVehicle(f.DB,f.user,defaultHousehold,{...input,primary_driver_id:f.outsider.person.id}),409);
 await rejects(updateVehicle(f.DB,f.user,v.id,1,{primary_driver_id:f.outsider.person.id}),409);
 f.db.prepare("UPDATE people SET deleted_at='inactive' WHERE id=?").run(f.peer.person.id);
 await rejects(updateVehicle(f.DB,f.user,v.id,1,{notes:'Invalid retained driver'}),409);
 v=await updateVehicle(f.DB,f.user,v.id,1,{primary_driver_id:null,status:'sold_inactive'});
 assert.equal(v.status,'sold_inactive');assert.equal(v.version,2);
 await rejects(updateVehicle(f.DB,f.user,v.id,2,{household_id:'other-home'}),400);
 await rejects(updateVehicle(f.DB,f.user,v.id,2,{created_by_user_id:'admin'}),400);
 await rejects(createVehicle(f.DB,f.user,defaultHousehold,{...input,updated_by_user_id:'admin'}),400);
});

test('Only new maintenance may advance last-known mileage; edits/deletion preserve explicit correction state',async t=>{
 const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,{...input,purchase_mileage:100});
 assert.equal(v.current_mileage,100);
 const m=await createMaintenance(f.DB,f.user,v.id,1,{description:'Oil changed',mileage:150,total_cost_cents:4599});
 let records=await listMaintenance(f.DB,f.peer,v.id);assert.equal(records.length,1);assert.equal(records[0].performed_by,'Local');assert.equal(records[0].category,null);
 assert.equal(records[0].total_cost_cents,4599);assert.equal(records[0].created_by_user_id,'local-account');
 await rejects(updateMaintenance(f.DB,f.outsider,v.id,m.id,2,1,{description:'Denied'}),403);
 await rejects(deleteMaintenance(f.DB,f.outsider,v.id,m.id,2,1),403);await rejects(listMaintenance(f.DB,f.outsider,v.id),403);
 await updateMaintenance(f.DB,f.peer,v.id,m.id,2,1,{category:'Oil & Filter',performed_by:'Jensen Tire',mileage:200});
 records=await listMaintenance(f.DB,f.user,v.id);assert.equal(records[0].created_by_user_id,'local-account');assert.equal(records[0].updated_by_user_id,'peer');assert.equal(records[0].performed_by,'Jensen Tire');
 await rejects(updateMaintenance(f.DB,f.user,v.id,m.id,3,1,{notes:'Stale'}),409);
 assert.equal((await getVehicle(f.DB,f.user,v.id)).version,3);assert.equal((await getVehicle(f.DB,f.user,v.id)).current_mileage,150);
 await updateMaintenance(f.DB,f.user,v.id,m.id,3,2,{mileage:120});assert.equal((await getVehicle(f.DB,f.user,v.id)).current_mileage,150);
 await deleteMaintenance(f.DB,f.peer,v.id,m.id,4,3);assert.deepEqual(await listMaintenance(f.DB,f.user,v.id),[]);
 const deleted=f.db.prepare('SELECT * FROM vehicle_maintenance WHERE id=?').get(m.id);assert.ok(deleted.deleted_at);assert.equal(deleted.deleted_by_user_id,'peer');
 assert.equal((await getVehicle(f.DB,f.user,v.id)).current_mileage,150);
 await rejects(updateVehicle(f.DB,f.user,v.id,5,{current_mileage:140}),400);
 await rejects(updateVehicle(f.DB,f.user,v.id,5,{current_mileage:200}),400);
 await rejects(updateVehicle(f.DB,f.user,v.id,5,{current_mileage:null}),400);
 await rejects(correctVehicleMileage(f.DB,f.user,v.id,5,190,''),400);
 const corrected=await correctVehicleMileage(f.DB,f.user,v.id,5,90,'Correct odometer entry');assert.equal(corrected.current_mileage,90);
 assert.equal(f.db.prepare("SELECT action FROM security_audit").get().action,'vehicle.mileage.correct');
});

test('Manual mileage correction survives a later historical maintenance edit; new maintenance can advance it',async t=>{
 const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,{...input,purchase_mileage:100});
 const historical=await createMaintenance(f.DB,f.user,v.id,1,{description:'Historical service',mileage:200});
 assert.equal((await getVehicle(f.DB,f.user,v.id)).current_mileage,200);
 const corrected=await correctVehicleMileage(f.DB,f.user,v.id,2,100,'Odometer was replaced');
 assert.equal(corrected.current_mileage,100);assert.equal(corrected.version,3);
 await updateMaintenance(f.DB,f.user,v.id,historical.id,3,1,{notes:'Added a missing note'});
 const afterEdit=await getVehicle(f.DB,f.user,v.id);assert.equal(afterEdit.current_mileage,100);assert.equal(afterEdit.version,4);
 const audit=f.db.prepare("SELECT details FROM security_audit WHERE action='vehicle.mileage.correct'").get();
 assert.deepEqual(JSON.parse(audit.details),{operation:'mileage',from:200,to:100,reason:'Odometer was replaced'});
 await createMaintenance(f.DB,f.user,v.id,4,{description:'New oil change',mileage:150});
 assert.equal((await getVehicle(f.DB,f.user,v.id)).current_mileage,150);
});

test('Concurrent maintenance adds serialize on vehicle revision and stale writes leave no partial records/audits',async t=>{
 const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,input);
 const results=await Promise.allSettled([100,200].map(mileage=>createMaintenance(f.DB,f.user,v.id,1,{description:'Service',mileage})));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
 assert.equal((await listMaintenance(f.DB,f.user,v.id)).length,1);
 await rejects(updateVehicle(f.DB,f.admin,v.id,1,{notes:'Stale'},{administration:true}),409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM security_audit').get().n,0);
});

test('Writes recheck active account, bound identity, person, household membership and Administrator authority in transaction',async t=>{
 for(const revoke of ["UPDATE app_users SET status='disabled' WHERE id='local-account'","UPDATE user_identities SET subject='replaced' WHERE user_id='local-account'","UPDATE people SET household_id='other-home' WHERE id='"+localPerson+"'","UPDATE people SET deleted_at='inactive' WHERE id='"+localPerson+"'"]){
  const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,input),original=f.DB.batch;
  f.DB.batch=statements=>{f.db.exec(revoke);return original(statements);};
  await rejects(createMaintenance(f.DB,f.user,v.id,1,{description:'Denied',mileage:200}),409);
  assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_maintenance').get().n,0);assert.equal(f.db.prepare('SELECT version FROM vehicles').get().version,1);
 }
 const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,input),original=f.DB.batch;
 f.DB.batch=statements=>{f.db.exec("UPDATE app_users SET role='member' WHERE id='admin'");return original(statements);};
 await rejects(updateVehicle(f.DB,f.admin,v.id,1,{notes:'Denied'},{administration:true}),409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM security_audit').get().n,0);assert.equal(f.db.prepare('SELECT notes FROM vehicles').get().notes,'');
});

test('Audit failure rolls back Administrator correction and explicit Member mileage correction; Admin cannot bypass validity',async t=>{
 const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,input),options={administration:true};
 await rejects(createVehicle(f.DB,f.admin,defaultHousehold,{...input,primary_driver_id:f.outsider.person.id},options),409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM security_audit').get().n,0);
 await rejects(createMaintenance(f.DB,f.admin,v.id,1,{description:'Bad category',category:'Unapproved'},options),400);
 f.db.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON security_audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
 await assert.rejects(updateVehicle(f.DB,f.admin,v.id,1,{notes:'Rollback'},options),/test audit failure/);
 await assert.rejects(createMaintenance(f.DB,f.admin,v.id,1,{description:'Rollback'},options),/test audit failure/);
 await assert.rejects(correctVehicleMileage(f.DB,f.user,v.id,1,100,'Correction'),/test audit failure/);
 assert.equal(f.db.prepare('SELECT version FROM vehicles').get().version,1);assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_maintenance').get().n,0);
});

test('Inactive targets and accounts never gain access through the Vehicles API',async t=>{
 const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,input);
 f.db.exec("UPDATE app_users SET status='pending' WHERE id='peer'");assert.deepEqual(await listVehicles(f.DB,f.peer,defaultHousehold),[]);await rejects(getVehicle(f.DB,f.peer,v.id),403);
 f.db.exec("UPDATE app_users SET status='disabled' WHERE id='peer'");await rejects(createVehicle(f.DB,f.peer,defaultHousehold,input),409);
 f.db.exec("DROP TRIGGER household_delete_members; UPDATE households SET deleted_at='inactive' WHERE id='"+defaultHousehold+"'");
 await rejects(getVehicle(f.DB,f.admin,v.id,{administration:true}),403);
 // The account gate and household policy remain authoritative on the routed feature.
 assert.equal((await f.request('/api/vehicles')).status,403);
 f.db.exec("UPDATE app_users SET status='disabled' WHERE id='local-account'");
 assert.equal((await f.request('/api/vehicles')).status,403);
});

test('Administrator maintenance corrections are explicit and audited; a disappeared child aborts its parent update',async t=>{
 const f=setup(t),v=await createVehicle(f.DB,f.user,defaultHousehold,input),options={administration:true};
 const m=await createMaintenance(f.DB,f.admin,v.id,1,{description:'Shop service',performed_by:'Woodhouse',mileage:100},options);
 await updateMaintenance(f.DB,f.admin,v.id,m.id,2,1,{description:'Correct service'},options);
 await deleteMaintenance(f.DB,f.admin,v.id,m.id,3,2,options);
 assert.equal(f.db.prepare("SELECT count(*) n FROM security_audit WHERE action='vehicle.correctAny'").get().n,3);
 const other=await createMaintenance(f.DB,f.user,v.id,4,{description:'Other service'}),original=f.DB.batch;
 f.DB.batch=statements=>{f.db.prepare('DELETE FROM vehicle_maintenance WHERE id=?').run(other.id);return original(statements);};
 await rejects(updateMaintenance(f.DB,f.user,v.id,other.id,5,1,{description:'Must not save'}),409);
 assert.equal(f.db.prepare('SELECT version FROM vehicles').get().version,5);
});
