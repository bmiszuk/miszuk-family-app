import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import worker from '../worker.js';
import {createVehicle} from '../src/api/vehicles/service.js';
import {runAttachmentCleanup} from '../src/api/vehicles/attachments.js';
import {attachmentType,attachmentFilename,attachmentDisposition,attachmentMaxBytes} from '../src/domain/vehicleAttachments.js';
import {defaultHousehold,localPerson} from './account-fixture.mjs';

const pdf=new TextEncoder().encode('%PDF-1.7\nSynthetic test only');
function storage(){
 const objects=new Map(),calls={put:0,get:0,delete:0};
 return {objects,calls,failPut:false,failDelete:false,afterPut:null,
  async put(key,bytes){calls.put++;objects.set(key,{bytes:new Uint8Array(bytes),uploaded:new Date()});if(this.afterPut)await this.afterPut(key);if(this.failPut)throw new Error('Synthetic uncertain put');return {key};},
  async get(key){calls.get++;const object=objects.get(key);return object?{body:new Blob([object.bytes]).stream()}:null;},
  async delete(key){calls.delete++;if(this.failDelete)throw new Error('Synthetic unavailable storage');objects.delete(key);},
  async list(){return {objects:[...objects].map(([key,object])=>({key,uploaded:object.uploaded})),truncated:false};},
 };
}
async function setup(t){
 const f=fixture(t),r2=storage(),env={DB:f.DB,LOCAL_DEV:'true',ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',VEHICLE_ATTACHMENTS:r2};
 const batch=f.DB.batch.bind(f.DB);let queue=Promise.resolve();f.DB.batch=statements=>{const result=queue.then(()=>batch(statements));queue=result.catch(()=>{});return result;};
 const v=(await f.request('/api/vehicles','POST',{make:'Toyota',model:'Camry'})).data.item;
 const base='/api/vehicles/'+v.id;
 async function call(path,method='GET',bytes,extra={}){
  const response=await worker.fetch(new Request('http://localhost'+path,{method,headers:{'Content-Type':'application/pdf','X-Attachment-Filename':encodeURIComponent('Receipt.pdf'),...extra.headers},...(bytes?{body:bytes}:{}),...extra.request}),env);
  return {status:response.status,headers:response.headers,data:response.headers.get('Content-Type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer())};
 }
 return {...f,r2,env,v,base,call};
}
test('Attachment migration preserves schema/data and enforces parent, quota, references and immutable metadata',async t=>{
 const f=await setup(t);
 assert.equal(f.db.prepare('SELECT count(*) n FROM app_users').get().n,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM vehicles').get().n,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND name IN ('vehicle_attachments','vehicle_attachment_cleanup','vehicle_attachment_scan')").get().n,3);
 const result=await f.call(f.base+'/attachments','POST',pdf);assert.equal(result.status,201);
 assert.throws(()=>f.db.prepare('UPDATE vehicle_attachments SET filename=?').run('Changed.pdf'),/cannot be replaced/);
 assert.throws(()=>f.db.prepare('UPDATE vehicle_attachments SET state=?').run('uploading'),/cannot be replaced/);
 assert.throws(()=>f.db.exec('DELETE FROM vehicles'),/FOREIGN KEY/);
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('Vehicle and maintenance attachments share upload/list/open/download/delete, safe names and sanitized metadata',async t=>{
 const f=await setup(t),m=(await f.request(f.base+'/maintenance','POST',{vehicle_version:1,description:'Service'})).data;
 for(const path of [f.base+'/attachments',f.base+'/maintenance/'+m.id+'/attachments']){
  const result=await f.call(path,'POST',pdf,{headers:{'X-Attachment-Filename':encodeURIComponent('C:\\fakepath\\résumé\r\n.pdf')}});assert.equal(result.status,201,JSON.stringify(result.data));
  assert.equal(result.data.item.filename,'résumé.pdf');assert.deepEqual(Object.keys(result.data.item).sort(),['byte_size','content_type','filename','id','state']);
  const id=result.data.item.id,key=f.db.prepare('SELECT object_key FROM vehicle_attachments WHERE id=?').get(id).object_key;
  assert.match(key,/^vehicles\/v1\/[0-9a-f-]{36}$/);assert.ok(!key.includes(f.v.id));assert.ok(!key.includes(id));
  assert.equal((await f.call(path)).data.items.length,1);
  const open=await f.call(path+'/'+id+'/file');assert.equal(open.status,200);assert.deepEqual(open.data,pdf);assert.equal(open.headers.get('Cache-Control'),'private, no-store');assert.equal(open.headers.get('X-Content-Type-Options'),'nosniff');assert.match(open.headers.get('Content-Disposition'),/^inline;.*UTF-8''r%C3%A9sum%C3%A9.pdf/);
  assert.match((await f.call(path+'/'+id+'/file?download=true')).headers.get('Content-Disposition'),/^attachment;/);
  assert.equal((await f.call(path+'/'+id,'DELETE')).data.cleanup_pending,false);assert.ok(!f.r2.objects.has(key));assert.equal((await f.call(path+'/'+id+'/file')).status,404);
 }
 assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachment_cleanup').get().n,0);
});
test('Attachment file size/type validation measures the real stream; PDF/JPEG/PNG/HEIC/HEIF only',async t=>{
 const f=await setup(t),path=f.base+'/attachments';
 for(const [bytes,type] of [[new Uint8Array([255,216,255,0]),'image/jpeg'],[new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'],[new Uint8Array([0,0,0,20,102,116,121,112,104,101,105,99,0,0,0,0,109,105,102,49]),'image/heic']]){
  const result=await f.call(path,'POST',bytes,{headers:{'Content-Type':type}});assert.equal(result.status,201);assert.equal(result.data.item.content_type,type);
 }
 assert.equal((await f.call(path,'POST',pdf,{headers:{'Content-Type':'image/png'}})).status,415);
 assert.equal((await f.call(path,'POST',new TextEncoder().encode('<html>file</html>'))).status,415);
 assert.equal((await f.call(path,'POST',new Uint8Array(0))).status,400);
 assert.equal((await f.call(path,'POST',pdf,{headers:{'X-Attachment-Filename':''}})).status,400);
 const large=new Uint8Array(attachmentMaxBytes+1);large.set(pdf);
 assert.equal((await f.call(path,'POST',large,{headers:{'Content-Length':'1'}})).status,413);
 const exact=new Uint8Array(attachmentMaxBytes);exact.set(pdf);assert.equal((await f.call(path,'POST',exact)).status,201);
 assert.equal(f.r2.objects.size,4);
});
test('Content-validated upload replaces dangerous/misleading filename extensions in stored and downloaded names',async t=>{
 const f=await setup(t),path=f.base+'/attachments';
 const uploaded=await f.call(path,'POST',pdf,{headers:{'X-Attachment-Filename':encodeURIComponent('Service receipt.CMD')}});
 assert.equal(uploaded.status,201);assert.equal(uploaded.data.item.filename,'Service receipt.pdf');
 const metadata=f.db.prepare('SELECT filename,content_type FROM vehicle_attachments WHERE id=?').get(uploaded.data.item.id);
 assert.deepEqual({...metadata},{filename:'Service receipt.pdf',content_type:'application/pdf'});
 const downloaded=await f.call(path+'/'+uploaded.data.item.id+'/file?download=true');
 assert.match(downloaded.headers.get('Content-Disposition'),/filename="Service receipt\.pdf"/);
 assert.match(downloaded.headers.get('Content-Disposition'),/filename\*=UTF-8''Service%20receipt\.pdf/);
 assert.equal(f.r2.objects.size,1);
});
test('Maintenance history reports its attachment count for the delete confirmation without exposing storage keys',async t=>{
 const f=await setup(t),m=(await f.request(f.base+'/maintenance','POST',{vehicle_version:1,description:'Receipt service'})).data;
 const path=f.base+'/maintenance/'+m.id+'/attachments',rows=()=>f.request(f.base+'/maintenance');
 let items=(await rows()).data.items;assert.equal(items[0].attachment_count,0);assert.ok(!('object_key' in items[0]));
 assert.equal((await f.call(path,'POST',pdf)).status,201);
 items=(await rows()).data.items;assert.equal(items[0].attachment_count,1);assert.ok(!('object_key' in items[0]));
});
test('Concurrent attachment reservations enforce five per parent, with independent vehicle/maintenance quotas',async t=>{
 const f=await setup(t),m=(await f.request(f.base+'/maintenance','POST',{vehicle_version:1,description:'Service'})).data;
 const statuses=(await Promise.all(Array.from({length:6},()=>f.call(f.base+'/attachments','POST',pdf)))).map(r=>r.status);
 assert.equal(statuses.filter(s=>s===201).length,5);assert.equal(statuses.filter(s=>s===409).length,1);assert.equal(f.r2.objects.size,5);
 for(let i=0;i<5;i++)assert.equal((await f.call(f.base+'/maintenance/'+m.id+'/attachments','POST',pdf)).status,201);
 assert.equal((await f.call(f.base+'/maintenance/'+m.id+'/attachments','POST',pdf)).status,409);
});
test('Every attachment operation rejects other households; Administrator must request Vehicle-specific correction mode',async t=>{
 const f=await setup(t),other=crypto.randomUUID(),person=crypto.randomUUID(),account=crypto.randomUUID();
 f.db.prepare('INSERT INTO households(id,name) VALUES(?,?)').run(other,'Other');
 f.db.prepare('INSERT INTO people(id,family_id,first_name,household_id) VALUES(?,?,?,?)').run(person,'existing','Other',other);
 f.db.prepare("INSERT INTO app_users(id,person_id,status,role) VALUES(?,?,'active','member')").run(account,person);
 f.db.prepare("INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES(?,?,'cloudflare_access','https://test.cloudflareaccess.com',?,?,CURRENT_TIMESTAMP)").run(crypto.randomUUID(),account,'other@example.test','other');
 const v=await createVehicle(f.DB,{id:'other',account:{id:account,role:'member'},person:{id:person},household:{id:other}},other,{make:'Other',model:'Vehicle'}),path='/api/vehicles/'+v.id+'/attachments';
 const unknown=crypto.randomUUID();
 for(const [suffix,method,body] of [['','GET'],['','POST',pdf],['/'+unknown,'DELETE'],['/'+unknown+'/file','GET']])assert.equal((await f.call(path+suffix,method,body)).status,403);
 assert.equal(f.r2.calls.put,0);assert.equal(f.r2.calls.get,0);
 f.db.exec("UPDATE app_users SET role='administrator' WHERE id='local-account'");
 assert.equal((await f.call(path)).status,403);
 const result=await f.call(path+'?administration=true','POST',pdf);assert.equal(result.status,201);
 assert.equal((await f.call(path+'/'+result.data.item.id+'/file?administration=true')).status,200);
 assert.equal((await f.call(path+'/'+result.data.item.id+'?administration=true','DELETE')).status,200);
 assert.equal(f.db.prepare("SELECT count(*) n FROM security_audit WHERE action='vehicle.correctAny'").get().n,2);
 f.db.exec("UPDATE app_users SET status='disabled' WHERE id='local-account'");assert.equal((await f.call(f.base+'/attachments')).status,403);
});
test('Upload uncertainty and R2 deletion failure remain explicit and retryable; parent deletion atomically queues cleanup',async t=>{
 const f=await setup(t),path=f.base+'/attachments';f.r2.failPut=true;f.r2.failDelete=true;
 assert.equal((await f.call(path,'POST',pdf)).status,503);assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachments').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachment_cleanup').get().n,1);assert.equal(f.r2.objects.size,1);
 f.r2.failPut=false;f.r2.failDelete=false;await runAttachmentCleanup(f.env);assert.equal(f.r2.objects.size,0);assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachment_cleanup').get().n,0);
 const m=(await f.request(f.base+'/maintenance','POST',{vehicle_version:1,description:'Service'})).data;
 await f.call(f.base+'/maintenance/'+m.id+'/attachments','POST',pdf);
 const kept=(await f.call(path,'POST',pdf)).data.item;
 f.r2.failDelete=true;
 const removed=await f.request(f.base+'/maintenance/'+m.id,'DELETE',{vehicle_version:2,version:1},{env:{VEHICLE_ATTACHMENTS:f.r2}});assert.equal(removed.status,200);assert.equal(removed.data.cleanup_pending,true);
 assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachments WHERE maintenance_id IS NOT NULL').get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachment_cleanup').get().n,1);
 assert.equal((await f.call(f.base+'/maintenance/'+m.id+'/attachments')).status,404);
 f.r2.failDelete=false;await runAttachmentCleanup(f.env);assert.equal(f.r2.objects.size,1);
 assert.equal((await f.call(path+'/'+kept.id+'/file')).status,200);
 assert.equal((await f.request(f.base,'PATCH',{version:3,status:'sold_inactive'})).status,200);assert.equal((await f.call(path)).data.items.length,1);
});
test('Missing R2 data returns an explicit unavailable error, not a broken success response',async t=>{
 const f=await setup(t),path=f.base+'/attachments',file=(await f.call(path,'POST',pdf)).data.item;
 f.r2.objects.clear();assert.equal((await f.call(path+'/'+file.id+'/file')).status,503);assert.equal((await f.call(path)).data.items.length,1);
});
test('Administrator audit failure and transaction-time revocation roll back before any R2 write/delete',async t=>{
 const f=await setup(t),path=f.base+'/attachments';f.db.exec("UPDATE app_users SET role='administrator'");
 const item=(await f.call(path+'?administration=true','POST',pdf)).data.item;
 f.db.exec("CREATE TRIGGER fail_attachment_audit BEFORE INSERT ON security_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 assert.equal((await f.call(path+'?administration=true','POST',pdf)).status,500);
 assert.equal((await f.call(path+'/'+item.id+'?administration=true','DELETE')).status,500);
 assert.equal(f.r2.calls.put,1);assert.equal(f.r2.calls.delete,0);assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachments').get().n,1);
 f.db.exec('DROP TRIGGER fail_attachment_audit');const batch=f.DB.batch;let revoke=true;
 f.DB.batch=statements=>{if(revoke){revoke=false;f.db.exec("UPDATE app_users SET role='member'");}return batch(statements);};
 assert.equal((await f.call(path+'?administration=true','POST',pdf)).status,409);assert.equal(f.r2.calls.put,1);
});
test('Late uploads after concurrent parent deletion and old unreferenced R2 objects are cleaned up',async t=>{
 const f=await setup(t),m=(await f.request(f.base+'/maintenance','POST',{vehicle_version:1,description:'Service'})).data;
 f.r2.afterPut=async()=>{const r=await f.request(f.base+'/maintenance/'+m.id,'DELETE',{vehicle_version:2,version:1},{env:{VEHICLE_ATTACHMENTS:f.r2}});assert.equal(r.status,200);};
 assert.equal((await f.call(f.base+'/maintenance/'+m.id+'/attachments','POST',pdf)).status,503);assert.equal(f.r2.objects.size,0);
 const orphan='vehicles/v1/'+crypto.randomUUID();f.r2.objects.set(orphan,{bytes:pdf,uploaded:new Date(Date.now()-2*60*60_000)});
 const young='vehicles/v1/'+crypto.randomUUID();f.r2.objects.set(young,{bytes:pdf,uploaded:new Date()});
 await runAttachmentCleanup(f.env);assert.ok(!f.r2.objects.has(orphan));assert.ok(f.r2.objects.has(young));
});
test('Interrupted uploads expire, and D1 cleanup acknowledgement failures preserve the deletion job',async t=>{
 const f=await setup(t),path=f.base+'/attachments',item=(await f.call(path,'POST',pdf)).data.item,key=f.db.prepare('SELECT object_key FROM vehicle_attachments WHERE id=?').get(item.id).object_key;
 f.db.exec('DROP TRIGGER vehicle_attachment_immutable');f.db.prepare("UPDATE vehicle_attachments SET state='uploading',upload_expires_at=? WHERE id=?").run('2020-01-01T00:00:00Z',item.id);
 f.db.exec("CREATE TRIGGER fail_cleanup_ack BEFORE DELETE ON vehicle_attachment_cleanup BEGIN SELECT RAISE(ABORT,'synthetic D1 failure'); END");
 await runAttachmentCleanup(f.env);assert.ok(!f.r2.objects.has(key));assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachment_cleanup').get().n,1);
 f.db.exec('DROP TRIGGER fail_cleanup_ack');await runAttachmentCleanup(f.env);assert.equal(f.db.prepare('SELECT count(*) n FROM vehicle_attachment_cleanup').get().n,0);
});
test('Filename handling rejects path/control tricks and HEIF recognition excludes AVIF',()=>{
 assert.equal(attachmentFilename('../../receipt\r\n.pdf'),'receipt.pdf');assert.equal(attachmentFilename('a'.repeat(200)).length,180);assert.ok(!attachmentDisposition('"résumé".pdf').includes('\r'));
 assert.equal(attachmentFilename('Receipt.CMD','application/pdf'),'Receipt.pdf');
 assert.equal(attachmentFilename('Photo.exe','image/jpeg'),'Photo.jpg');
 assert.equal(attachmentFilename('Photo.JPEG','image/jpeg'),'Photo.jpeg');
 assert.equal(attachmentFilename('Scan.txt','image/png'),'Scan.png');
 assert.equal(attachmentFilename('Family.heic','image/heic'),'Family.heic');
 assert.equal(attachmentFilename('Document.cmd','image/heif'),'Document.heif');
 assert.equal(attachmentFilename('CON.exe','application/pdf'),'_CON.pdf');
 assert.equal(attachmentFilename('a'.repeat(200)+'.cmd','application/pdf').length,180);
 assert.equal(attachmentType(new Uint8Array([0,0,0,20,102,116,121,112,109,105,102,49,0,0,0,0,97,118,105,102])),null);
 assert.equal(attachmentType(new Uint8Array([0,0,0,16,102,116,121,112,109,105,102,49,0,0,0,0])),'image/heif');
});
