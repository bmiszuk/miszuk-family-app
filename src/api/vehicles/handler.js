import {bodyJson,HttpError} from '../shared/errors.js';
import {jsonResponse,isUuid} from '../shared/utils.js';
import {can} from '../shared/permissions.js';
import {vehicleFields,maintenanceFields} from '../../domain/vehicles.js';
import {createVehicle,getVehicle,listVehicles,updateVehicle,correctVehicleMileage,vehicleDrivers,createMaintenance,listMaintenance,updateMaintenance,deleteMaintenance} from './service.js';
import {handleAttachments,cleanupMaintenanceAttachments} from './attachments.js';

function fields(body,allowed){if(Object.keys(body).some(key=>!allowed.includes(key)))throw new HttpError(400,'Unsupported vehicle fields.');}
function pick(row,keys){return Object.fromEntries(keys.map(key=>[key,row[key]]));}
// Never serialize raw records or account/Cloudflare identifiers.
export const publicVehicle=row=>pick(row,['id','household_id',...vehicleFields,'version']);
export const publicMaintenance=row=>pick(row,['id',...maintenanceFields,'version','created_at','updated_at','attachment_count']);
function page(rows,offset,serialize){return {items:rows.slice(0,50).map(serialize),next_offset:rows.length>50?offset+50:null};}
export async function handleVehicles(request,env,member){
 const url=new URL(request.url),parts=url.pathname.split('/').slice(3),id=parts[0],operation=parts[1],entryId=parts[2],method=request.method;
 const mode=url.searchParams.get('administration');
 if(mode!==null&&!['true','false'].includes(mode))throw new HttpError(400,'Invalid administration mode.');
 const administration=mode==='true';
 if(administration&&!can(member,'vehicle.readAny'))throw new HttpError(403,'Not allowed.');
 // Household selection is an explicit Administrator operation, never a Member identity input.
 const requested=url.searchParams.get('household_id');
 if(requested!==null&&!administration)throw new HttpError(403,'Not allowed.');
 if(requested!==null&&!isUuid(requested))throw new HttpError(400,'Choose a household.');
 const household=administration?(requested||member.household?.id):member.household?.id;
 if(!household)throw new HttpError(403,'No household assigned. Contact Bob.','HOUSEHOLD_REQUIRED');
 const offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new HttpError(400,'Invalid page.');
 const options={administration,offset},db=env.DB;
 const attachmentAt=operation==='attachments'?1:operation==='maintenance'&&parts[3]==='attachments'?3:-1;
 if(attachmentAt!==-1){
  if(!isUuid(id)||(attachmentAt===3&&!isUuid(entryId)))throw new HttpError(404,'Attachment parent not found.');
  return handleAttachments(request,env,member,id,attachmentAt===3?entryId:null,parts.slice(attachmentAt+1),options);
 }
 if(parts.length>3)throw new HttpError(404,'Vehicle not found.');
 if(method==='GET'&&id==='people'&&!operation){
  return jsonResponse({items:await vehicleDrivers(db,member,household,options)});
 }
 if(!id){
  if(method==='GET')return jsonResponse(page(await listVehicles(db,member,household,options),offset,publicVehicle));
  if(method==='POST')return jsonResponse({item:publicVehicle(await createVehicle(db,member,household,await bodyJson(request),options))},201);
  throw new HttpError(405,'Method not allowed.');
 }
 if(!isUuid(id))throw new HttpError(404,'Vehicle not found.');
 if(!operation){
  if(method==='GET')return jsonResponse({item:publicVehicle(await getVehicle(db,member,id,options))});
  if(method==='PATCH'){
   const body=await bodyJson(request);fields(body,['version',...vehicleFields]);const {version,...input}=body;
   return jsonResponse({item:publicVehicle(await updateVehicle(db,member,id,version,input,options))});
  }
  throw new HttpError(405,'Method not allowed.');
 }
 if(operation==='mileage'&&!entryId&&method==='POST'){
  const body=await bodyJson(request);fields(body,['version','current_mileage','reason']);
  if(body.current_mileage===undefined)throw new HttpError(400,'Enter a mileage or explicitly clear it.');
  return jsonResponse({item:publicVehicle(await correctVehicleMileage(db,member,id,body.version,body.current_mileage,body.reason,options))});
 }
 if(operation==='maintenance'){
  if(!entryId){
   if(method==='GET')return jsonResponse(page(await listMaintenance(db,member,id,options),offset,publicMaintenance));
   if(method==='POST'){
    const body=await bodyJson(request);fields(body,['vehicle_version',...maintenanceFields]);const {vehicle_version,...input}=body;
    return jsonResponse(await createMaintenance(db,member,id,vehicle_version,input,options),201);
   }
  }else if(isUuid(entryId)){
   if(method==='PATCH'){
    const body=await bodyJson(request);fields(body,['vehicle_version','version',...maintenanceFields]);const {vehicle_version,version,...input}=body;
    return jsonResponse(await updateMaintenance(db,member,id,entryId,vehicle_version,version,input,options));
   }
   if(method==='DELETE'){
    const body=await bodyJson(request);fields(body,['vehicle_version','version']);
    const result=await deleteMaintenance(db,member,id,entryId,body.vehicle_version,body.version,options);
    let pending;
    try{pending=(await cleanupMaintenanceAttachments(env)).pending;}catch{pending=true;console.warn('vehicle-attachments parent cleanup pending');}
    return jsonResponse({...result,cleanup_pending:pending});
   }
  }else throw new HttpError(404,'Maintenance record not found.');
 }
 throw new HttpError(405,'Method not allowed.');
}
