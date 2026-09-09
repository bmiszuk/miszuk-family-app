import {HttpError,bodyJson,stringField} from './errors.js';
import {jsonResponse,isUuid} from './utils.js';
export const DEFAULT_HOUSEHOLD = 'd47ed638-465c-4f19-a7ab-04bb18a30538';
export async function householdIdentity(env,member) {
  const person=await env.DB.prepare('SELECT id,first_name,last_name,household_id FROM people WHERE lower(trim(login_email))=? AND deleted_at IS NULL').bind(member.email.trim().toLowerCase()).first();
  const household=await env.DB.prepare('SELECT * FROM households WHERE id=?').bind(person?.household_id || DEFAULT_HOUSEHOLD).first();
  return {...member,person:person || null,household};
}
export async function handleHouseholds(request,env,id) {
  if(request.method==='GET'&&!id) return jsonResponse({items:(await env.DB.prepare('SELECT * FROM households WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE,id').all()).results});
  if(request.method==='DELETE' && isUuid(id)) {
    if(id===DEFAULT_HOUSEHOLD)throw new HttpError(409,'The default household keeps unassigned groceries available and cannot be deleted.');
    const row=await env.DB.prepare('UPDATE households SET deleted_at=? WHERE id=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM people WHERE household_id=? AND deleted_at IS NULL) RETURNING id').bind(new Date().toISOString(),id,id).first();
    if(!row)throw new HttpError(409,'Move all members out of this household before deleting it.');
    return jsonResponse({ok:true});
  }
  if(!['POST','PATCH'].includes(request.method)||(request.method==='POST'?Boolean(id):!isUuid(id))) throw new HttpError(405,'Method not allowed.');
  const body=await bodyJson(request),name=stringField(body.name,'Household name',100);
  const row=request.method==='POST'
    ? await env.DB.prepare('INSERT INTO households(id,name) VALUES(?,?) RETURNING *').bind(crypto.randomUUID(),name).first()
    : await env.DB.prepare('UPDATE households SET name=? WHERE id=? AND deleted_at IS NULL RETURNING *').bind(name,id).first();
  if(!row)throw new HttpError(404,'Household not found.');
  return jsonResponse({item:row},request.method==='POST'?201:200);
}
