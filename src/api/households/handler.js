import {HttpError,bodyJson,stringField} from '../shared/errors.js';
import {jsonResponse,isUuid} from '../shared/utils.js';
import {DEFAULT_HOUSEHOLD} from '../shared/identity.js';
import {can} from '../shared/permissions.js';
import {privilegedAudit} from '../shared/securityAudit.js';
export async function handleHouseholds(request,env,id,member) {
 const db=env.DB;
 if(request.method==='GET'&&!id) return jsonResponse({items:(await db.prepare('SELECT * FROM households WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE,id').all()).results});
 const action={POST:'household.create',PATCH:'household.rename',DELETE:'household.retire'}[request.method];
 if(!action || (request.method==='POST'?Boolean(id):!isUuid(id)))throw new HttpError(405,'Method not allowed.');
 if(!can(member,action))throw new HttpError(403,'Only an Administrator can manage households.');
 const body=await bodyJson(request);
 const current=id?await db.prepare('SELECT * FROM households WHERE id=? AND deleted_at IS NULL').bind(id).first():null;
 if(id&&!current)throw new HttpError(409,'Household changed. Refresh and try again.');
 if(id&&body.expected_name!==current.name)throw new HttpError(409,'Household changed. Refresh and try again.');
 if(request.method==='DELETE'&&id===DEFAULT_HOUSEHOLD)throw new HttpError(409,'The protected initial household cannot be retired.');
 const name=request.method==='DELETE'?null:stringField(body.name,'Household name',100);
 const target=id||crypto.randomUUID();
 const condition=id?{sql:'EXISTS(SELECT 1 FROM households WHERE id=? AND name=? AND deleted_at IS NULL)',args:[id,current.name]}:{sql:'1',args:[]};
 const statement=request.method==='POST'?db.prepare('INSERT INTO households(id,name) VALUES(?,?)').bind(target,name)
 :request.method==='PATCH'?db.prepare('UPDATE households SET name=? WHERE id=?').bind(name,id)
 :db.prepare('UPDATE households SET deleted_at=? WHERE id=?').bind(new Date().toISOString(),id);
 try {await db.batch([privilegedAudit(db,member,action,'household',target,{from:current?.name||null,to:name},condition),statement]);}
 catch(error) {
  if(/security_audit.id|Move all members out/.test(String(error.message)))throw new HttpError(409,'Household is occupied, or permission/record changed. Refresh and try again.');
  throw error;
 }
 return request.method==='DELETE'?jsonResponse({ok:true}):jsonResponse({item:await db.prepare('SELECT * FROM households WHERE id=?').bind(target).first()},request.method==='POST'?201:200);
}
