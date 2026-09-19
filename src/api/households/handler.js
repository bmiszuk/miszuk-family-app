import {HttpError,bodyJson,stringField} from '../shared/errors.js';
import {jsonResponse,isUuid} from '../shared/utils.js';
import {DEFAULT_HOUSEHOLD} from '../shared/identity.js';
import {can} from '../shared/permissions.js';
export async function handleHouseholds(request,env,id,member) {
  if (!can(member,'household.manage')) throw new HttpError(403,'Not allowed.');
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
