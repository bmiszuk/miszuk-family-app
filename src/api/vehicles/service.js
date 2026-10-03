import {can} from '../shared/permissions.js';
import {HttpError} from '../shared/errors.js';
import {privilegedAudit} from '../shared/securityAudit.js';
import {allowedFields,vehicleFields,maintenanceFields,vehicleValues,maintenanceValues,VehicleValidationError,advanceMileage} from '../../domain/vehicles.js';

// Pass only account-gate request context.
// Cross-household access is deliberate: callers must request administration mode.
function scope(user,household,action,administration=false){
 if(!household)throw new HttpError(403,'No household assigned. Contact Bob.','HOUSEHOLD_REQUIRED');
 const policy=administration?(action==='vehicle.read'?'vehicle.readAny':'vehicle.correctAny'):action;
 if(!can(user,policy,{household_id:household}))throw new HttpError(403,'Not allowed.');
 return {sql:`EXISTS(SELECT 1 FROM app_users u JOIN people p ON p.id=u.person_id
  JOIN user_identities i ON i.user_id=u.id JOIN households h ON h.id=?
  WHERE u.id=? AND u.status='active' AND p.id=? AND p.deleted_at IS NULL
  AND i.subject=? AND i.bound_at IS NOT NULL AND h.deleted_at IS NULL
  AND ${administration?"u.role='administrator'":'p.household_id=h.id'})`,
 args:[household,user.account.id,user.person.id,user.id]};
}
function validate(fn){try{return fn();}catch(error){if(error instanceof VehicleValidationError)throw new HttpError(400,error.message);throw error;}}
function revision(value){if(!Number.isSafeInteger(value)||value<1)throw new HttpError(400,'Current revision required.');}
function decode(row){return row?{...row,oil_filter_references:JSON.parse(row.oil_filter_references)}:null;}
function values(row){return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==='oil_filter_references'?JSON.stringify(value):value]));}
export async function transaction(db,statements){
 try {const results=await db.batch(statements);if(results.some(r=>!r.meta.changes))throw new HttpError(409,'Vehicle record changed. Refresh and try again.');}
 catch(error){
  if(/NOT NULL constraint failed|CHECK constraint failed|UNIQUE constraint failed|vehicles:/.test(String(error.message)))throw new HttpError(409,'Vehicle, driver or access changed. Refresh and try again.');
  throw error;
 }
}
export async function vehicle(db,user,id,options={},action='vehicle.read'){
 // Discover only the household identifier, never return an unscoped family record.
 const target=await db.prepare('SELECT household_id FROM vehicles WHERE id=?').bind(id).first();
 if(!target)throw new HttpError(404,'Vehicle not found.');
 const guard=scope(user,target.household_id,action,options.administration);
 const item=await db.prepare(`SELECT * FROM vehicles WHERE id=? AND household_id=? AND ${guard.sql}`).bind(id,target.household_id,...guard.args).first();
 if(!item)throw new HttpError(403,'Not allowed.');
 return {item:decode(item),guard};
}
function touch(db,user,item,guard,version,now,fields={}){
 const record=values(fields),keys=Object.keys(record);
 return db.prepare(`UPDATE vehicles SET ${keys.map(k=>k+'=?,').join('')}updated_by_user_id=?,updated_at=?,
 version=CASE WHEN version=? AND ${guard.sql} THEN version+1 ELSE NULL END WHERE id=?`)
 .bind(...Object.values(record),user.account.id,now,version,...guard.args,item.id);
}
function audit(db,user,item,guard,action,details={}){
 return privilegedAudit(db,user,action,'vehicle',item.id,details,
  {sql:`EXISTS(SELECT 1 FROM vehicles WHERE id=? AND version=? AND ${guard.sql})`,args:[item.id,item.version,...guard.args]});
}
export async function listVehicles(db,user,household,options={}){
 const guard=scope(user,household,'vehicle.read',options.administration);
 return (await db.prepare(`SELECT * FROM vehicles WHERE household_id=? AND ${guard.sql} ORDER BY status,make,model,id LIMIT 51 OFFSET ?`).bind(household,...guard.args,options.offset||0).all()).results.map(decode);
}
export async function vehicleDrivers(db,user,household,options={}){
 const guard=scope(user,household,'vehicle.read',options.administration);
 return (await db.prepare(`SELECT id,first_name,last_name FROM people WHERE household_id=? AND deleted_at IS NULL AND ${guard.sql} ORDER BY first_name,last_name,id`).bind(household,...guard.args).all()).results;
}
export async function getVehicle(db,user,id,options={}){return (await vehicle(db,user,id,options)).item;}
export async function createVehicle(db,user,household,input,options={}){
 const guard=scope(user,household,'vehicle.create',options.administration);
 const record=validate(()=>{allowedFields(input,vehicleFields);return vehicleValues(input);});
 record.current_mileage=advanceMileage(record.current_mileage,record.purchase_mileage);
 const id=crypto.randomUUID(),now=new Date().toISOString(),stored=values(record),keys=Object.keys(stored);
 const statements=[];
 if(options.administration)statements.push(privilegedAudit(db,user,'vehicle.correctAny','vehicle',id,{operation:'create',household_id:household},guard));
 statements.push(db.prepare(`INSERT INTO vehicles(id,household_id,${keys.join(',')},created_by_user_id,updated_by_user_id,created_at,updated_at)
 VALUES(CASE WHEN ${guard.sql} THEN ? ELSE NULL END,?,${keys.map(()=>'?').join(',')},?,?,?,?)`)
 .bind(...guard.args,id,household,...Object.values(stored),user.account.id,user.account.id,now,now));
 await transaction(db,statements);return getVehicle(db,user,id,options);
}
export async function updateVehicle(db,user,id,version,input,options={}){
 revision(version);const {item,guard}=await vehicle(db,user,id,options,'vehicle.update');
 const record=validate(()=>{allowedFields(input,vehicleFields);return vehicleValues({...item,...input});});
 if(input.current_mileage!==undefined&&record.current_mileage!==item.current_mileage)throw new HttpError(400,'Use an explicit mileage correction to change last-known mileage.');
 const statements=[];
 if(options.administration)statements.push(audit(db,user,{...item,version},guard,'vehicle.correctAny',{operation:'update'}));
 statements.push(touch(db,user,item,guard,version,new Date().toISOString(),record));
 await transaction(db,statements);return getVehicle(db,user,id,options);
}
export async function correctVehicleMileage(db,user,id,version,mileage,reason,options={}){
 revision(version);const {item,guard}=await vehicle(db,user,id,options,'vehicle.mileage.correct');
 const record=validate(()=>vehicleValues({...item,current_mileage:mileage}));
 if(typeof reason!=='string'||!reason.trim()||reason.trim().length>500)throw new HttpError(400,'Explain the mileage correction.');
 const action=options.administration?'vehicle.correctAny':'vehicle.mileage.correct';
 const details={operation:'mileage',from:item.current_mileage,to:record.current_mileage,reason:reason.trim()};
 const condition=`EXISTS(SELECT 1 FROM vehicles WHERE id=? AND version=? AND ${guard.sql})`;
 const entry=options.administration?audit(db,user,{...item,version},guard,action,details)
  :db.prepare(`INSERT INTO security_audit(id,actor_type,actor_user_id,action,target_type,target_id,details)
   VALUES(CASE WHEN ${condition} THEN ? ELSE NULL END,'user',?,'vehicle.mileage.correct','vehicle',?,?)`)
   .bind(id,version,...guard.args,crypto.randomUUID(),user.account.id,id,JSON.stringify(details));
 await transaction(db,[entry,touch(db,user,item,guard,version,new Date().toISOString(),{current_mileage:record.current_mileage})]);
 return getVehicle(db,user,id,options);
}
export async function listMaintenance(db,user,vehicleId,options={}){
 const {item,guard}=await vehicle(db,user,vehicleId,options);
 return (await db.prepare(`SELECT m.*,(SELECT count(*) FROM vehicle_attachments a WHERE a.maintenance_id=m.id) AS attachment_count FROM vehicle_maintenance m JOIN vehicles v ON v.id=m.vehicle_id
  WHERE v.id=? AND v.household_id=? AND m.deleted_at IS NULL AND ${guard.sql} ORDER BY m.service_date DESC,m.created_at DESC,m.id LIMIT 51 OFFSET ?`)
  .bind(vehicleId,item.household_id,...guard.args,options.offset||0).all()).results;
}
export async function createMaintenance(db,user,vehicleId,vehicleVersion,input,options={}){
 revision(vehicleVersion);const {item,guard}=await vehicle(db,user,vehicleId,options,'vehicle.maintenance.create');
 const record=validate(()=>{allowedFields(input,maintenanceFields);return maintenanceValues(input,{firstName:user.person.first_name});});
 const id=crypto.randomUUID(),now=new Date().toISOString(),keys=Object.keys(record),statements=[];
 if(options.administration)statements.push(audit(db,user,{...item,version:vehicleVersion},guard,'vehicle.correctAny',{operation:'maintenance.create',maintenance_id:id}));
 statements.push(touch(db,user,item,guard,vehicleVersion,now,{current_mileage:advanceMileage(item.current_mileage,record.mileage)}));
 statements.push(db.prepare(`INSERT INTO vehicle_maintenance(id,vehicle_id,${keys.join(',')},created_by_user_id,updated_by_user_id,created_at,updated_at)
  VALUES(?,?,${keys.map(()=>'?').join(',')},?,?,?,?)`).bind(id,vehicleId,...Object.values(record),user.account.id,user.account.id,now,now));
 await transaction(db,statements);return {id,vehicle_version:vehicleVersion+1};
}
async function changeMaintenance(db,user,vehicleId,id,vehicleVersion,version,input,options,remove){
 revision(vehicleVersion);revision(version);
 const {item,guard}=await vehicle(db,user,vehicleId,options,remove?'vehicle.maintenance.delete':'vehicle.maintenance.update');
 const existing=await db.prepare('SELECT * FROM vehicle_maintenance WHERE id=? AND vehicle_id=? AND deleted_at IS NULL').bind(id,vehicleId).first();
 if(!existing)throw new HttpError(404,'Maintenance record not found.');
 // A missing/stale maintenance row must abort before advancing the parent revision.
 guard.sql+=` AND EXISTS(SELECT 1 FROM vehicle_maintenance WHERE id=? AND vehicle_id=? AND version=? AND deleted_at IS NULL)`;
 guard.args.push(id,vehicleId,version);
 const record=remove?{}:validate(()=>{allowedFields(input,maintenanceFields);return maintenanceValues({...existing,...input});});
 const now=new Date().toISOString(),keys=Object.keys(record),statements=[];
 if(options.administration)statements.push(audit(db,user,{...item,version:vehicleVersion},guard,'vehicle.correctAny',{operation:remove?'maintenance.delete':'maintenance.update',maintenance_id:id}));
 // Only a newly created maintenance record may advance current mileage. Editing
 // historical details must never undo a later explicit mileage correction.
 statements.push(touch(db,user,item,guard,vehicleVersion,now,{}));
 statements.push(db.prepare(`UPDATE vehicle_maintenance SET ${keys.map(k=>k+'=?,').join('')}
  ${remove?'deleted_at=?,deleted_by_user_id=?,':''}updated_at=?,updated_by_user_id=?,
  version=CASE WHEN version=? AND deleted_at IS NULL AND ${guard.sql} THEN version+1 ELSE NULL END WHERE id=? AND vehicle_id=?`)
  .bind(...Object.values(record),...(remove?[now,user.account.id]:[]),now,user.account.id,version,...guard.args,id,vehicleId));
 await transaction(db,statements);return {id,version:version+1,vehicle_version:vehicleVersion+1};
}
export function updateMaintenance(db,user,vehicleId,id,vehicleVersion,version,input,options={}){return changeMaintenance(db,user,vehicleId,id,vehicleVersion,version,input,options,false);}
export function deleteMaintenance(db,user,vehicleId,id,vehicleVersion,version,options={}){return changeMaintenance(db,user,vehicleId,id,vehicleVersion,version,null,options,true);}
