import {HttpError} from '../shared/errors.js';
import {jsonResponse,isUuid} from '../shared/utils.js';
import {privilegedAudit} from '../shared/securityAudit.js';
import {vehicle,transaction} from './service.js';
import {attachmentFilename,attachmentType,attachmentDisposition,attachmentMaxBytes} from '../../domain/vehicleAttachments.js';

const prefix='vehicles/v1/';
const now=()=>new Date().toISOString();
function bucket(env){if(!env.VEHICLE_ATTACHMENTS)throw new HttpError(503,'Attachment storage is temporarily unavailable.');return env.VEHICLE_ATTACHMENTS;}
async function parent(env,user,vehicleId,maintenanceId,options,action){
 const {item,guard}=await vehicle(env.DB,user,vehicleId,options,action);
 if(maintenanceId){
  if(!await env.DB.prepare('SELECT id FROM vehicle_maintenance WHERE id=? AND vehicle_id=? AND deleted_at IS NULL').bind(maintenanceId,vehicleId).first())throw new HttpError(404,'Maintenance record not found.');
  guard.sql+=' AND EXISTS(SELECT 1 FROM vehicle_maintenance WHERE id=? AND vehicle_id=? AND deleted_at IS NULL)';guard.args.push(maintenanceId,vehicleId);
 }
 return {item,guard};
}
function adminAudit(env,user,vehicleId,guard,operation,id){return privilegedAudit(env.DB,user,'vehicle.correctAny','vehicle',vehicleId,{operation,attachment_id:id},guard);}
async function bytesFrom(request){
 const stated=Number(request.headers.get('Content-Length'));
 if(stated>attachmentMaxBytes)throw new HttpError(413,'Each attachment must be 10 MB or smaller.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Choose a file.');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>attachmentMaxBytes){await reader.cancel();throw new HttpError(413,'Each attachment must be 10 MB or smaller.');}chunks.push(value);}
 if(!size)throw new HttpError(400,'Empty files cannot be attached.');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
// Remove R2 first, then the durable job. A retry is safe if either step failed.
export async function drainAttachmentCleanup(env,keys){
 if(!env.VEHICLE_ATTACHMENTS)return {pending:true};
 let pending=false;
 for(const key of keys){
  try{await env.VEHICLE_ATTACHMENTS.delete(key);await env.DB.prepare('DELETE FROM vehicle_attachment_cleanup WHERE object_key=?').bind(key).run();}
  catch{pending=true;try{await env.DB.prepare('UPDATE vehicle_attachment_cleanup SET attempts=attempts+1 WHERE object_key=?').bind(key).run();}catch{/* The existing durable job survives. */}}
 }
 if(pending)console.warn('vehicle-attachments cleanup pending');
 return {pending};
}
export async function cleanupMaintenanceAttachments(env){
 // Metadata has already been removed transactionally by the parent-deletion trigger.
 // Drain a bounded global batch as jobs intentionally contain no family identifiers.
 const jobs=(await env.DB.prepare('SELECT object_key FROM vehicle_attachment_cleanup ORDER BY queued_at,object_key LIMIT 50').all()).results;
 return drainAttachmentCleanup(env,jobs.map(j=>j.object_key));
}
export async function handleAttachments(request,env,user,vehicleId,maintenanceId,segments,options){
 const id=segments[0],file=segments[1];
 if(segments.length>2||(id&&!isUuid(id))||(file&&file!=='file'))throw new HttpError(404,'Attachment not found.');
 const method=request.method,action=method==='GET'?'vehicle.read':method==='POST'?'vehicle.maintenance.create':'vehicle.maintenance.delete';
 const {guard}=await parent(env,user,vehicleId,maintenanceId,options,action);
 const db=env.DB,r2=bucket(env);
 if(!id&&method==='GET'){
  const items=(await db.prepare(`SELECT id,filename,content_type,byte_size,state FROM vehicle_attachments WHERE vehicle_id=? AND maintenance_id IS ? AND ${guard.sql} ORDER BY created_at,id`).bind(vehicleId,maintenanceId,...guard.args).all()).results;
  return jsonResponse({items});
 }
 if(!id&&method==='POST'){
  let supplied;try{supplied=decodeURIComponent(request.headers.get('X-Attachment-Filename')||'');}catch{throw new HttpError(400,'Invalid filename.');}
  const filename=attachmentFilename(supplied);if(!filename)throw new HttpError(400,'A filename is required.');
  const bytes=await bytesFrom(request),type=attachmentType(bytes),declared=request.headers.get('Content-Type')?.split(';')[0].toLowerCase();
  if(!type||(!['application/octet-stream',type].includes(declared)&&!(['image/heic','image/heif'].includes(type)&&['image/heic','image/heif'].includes(declared))))throw new HttpError(415,'Choose a PDF, JPEG, PNG or HEIC/HEIF file.');
  const id=crypto.randomUUID(),key=prefix+crypto.randomUUID(),expires=new Date(Date.now()+15*60_000).toISOString();
  const statements=[];
  if(options.administration)statements.push(adminAudit(env,user,vehicleId,guard,'attachment.upload',id));
  statements.push(db.prepare(`INSERT INTO vehicle_attachments(id,vehicle_id,maintenance_id,object_key,filename,content_type,byte_size,upload_expires_at,created_by_user_id)
   VALUES(CASE WHEN ${guard.sql} THEN ? ELSE NULL END,?,?,?,?,?,?,?,?)`).bind(...guard.args,id,vehicleId,maintenanceId,key,filename,type,bytes.length,expires,user.account.id));
  await transaction(db,statements);
  try{
   const saved=await r2.put(key,bytes,{httpMetadata:{contentType:type}});if(!saved)throw new Error('Object not stored');
   const update=await db.prepare(`UPDATE vehicle_attachments SET state='ready' WHERE id=? AND state='uploading' AND upload_expires_at>? AND ${guard.sql}`).bind(id,now(),...guard.args).run();
   if(update.meta.changes!==1)throw new Error('Upload authorization or parent changed');
  }catch{
   // Even a put() rejection can have an uncertain outcome. Always retain a cleanup key.
   try{await db.batch([db.prepare('DELETE FROM vehicle_attachments WHERE id=?').bind(id),db.prepare('INSERT OR IGNORE INTO vehicle_attachment_cleanup(object_key) VALUES(?)').bind(key)]);await drainAttachmentCleanup(env,[key]);}catch{console.warn('vehicle-attachments upload recovery pending');}
   throw new HttpError(503,'Upload did not complete. Refresh before trying again; incomplete files are cleaned up automatically.');
  }
  return jsonResponse({item:{id,filename,content_type:type,byte_size:bytes.length,state:'ready'}},201);
 }
 const item=await db.prepare(`SELECT * FROM vehicle_attachments WHERE id=? AND vehicle_id=? AND maintenance_id IS ? AND ${guard.sql}`).bind(id||'',vehicleId,maintenanceId,...guard.args).first();
 if(!item)throw new HttpError(404,'Attachment not found.');
 if(method==='GET'&&file==='file'){
  if(item.state!=='ready')throw new HttpError(409,'This file has not finished uploading.');
  const object=await r2.get(item.object_key);if(!object?.body)throw new HttpError(503,'This file is temporarily unavailable. Contact Bob if it persists.');
  return new Response(object.body,{headers:{'Content-Type':item.content_type,'Content-Length':String(item.byte_size),'Content-Disposition':attachmentDisposition(item.filename,new URL(request.url).searchParams.get('download')==='true'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'}});
 }
 if(method==='DELETE'&&!file){
  guard.sql+=' AND EXISTS(SELECT 1 FROM vehicle_attachments WHERE id=?)';guard.args.push(item.id);
  const statements=[];
  if(options.administration)statements.push(adminAudit(env,user,vehicleId,guard,'attachment.delete',item.id));
  statements.push(db.prepare(`DELETE FROM vehicle_attachments WHERE id=? AND vehicle_id=? AND maintenance_id IS ? AND ${guard.sql}`).bind(item.id,vehicleId,maintenanceId,...guard.args));
  await transaction(db,statements);
  const {pending}=await drainAttachmentCleanup(env,[item.object_key]);return jsonResponse({deleted:true,cleanup_pending:pending});
 }
 throw new HttpError(405,'Method not allowed.');
}

// Reuse the existing daily Cron invocations. Bounded work; no notification behavior change.
export async function runAttachmentCleanup(env){
 if(!env.VEHICLE_ATTACHMENTS)return;
 try{
  await env.DB.prepare("DELETE FROM vehicle_attachments WHERE state='uploading' AND upload_expires_at<?").bind(now()).run();
  await cleanupMaintenanceAttachments(env);
  const scan=await env.DB.prepare('SELECT cursor FROM vehicle_attachment_scan WHERE id=1').first();
  const page=await env.VEHICLE_ATTACHMENTS.list({prefix,limit:100,...(scan?.cursor?{cursor:scan.cursor}:{})});
  // This covers a crash or a late R2 put after concurrent parent deletion, even
  // after the original deletion job was consumed. Only old, unreferenced keys qualify.
  for(const object of page.objects){
   if(new Date(object.uploaded).getTime()>Date.now()-60*60_000)continue;
   const exists=await env.DB.prepare('SELECT id FROM vehicle_attachments WHERE object_key=?').bind(object.key).first();
   if(!exists)await env.VEHICLE_ATTACHMENTS.delete(object.key);
  }
  await env.DB.prepare('UPDATE vehicle_attachment_scan SET cursor=? WHERE id=1').bind(page.truncated?page.cursor:null).run();
 }catch{console.warn('vehicle-attachments scheduled cleanup incomplete');}
}
