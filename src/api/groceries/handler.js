import {householdScope} from '../shared/permissions.js';
import {bodyJson,HttpError,stringField} from '../shared/errors.js';
import {jsonResponse} from '../shared/utils.js';
import {boolField} from '../shared/recordValues.js';
import {handleRecords} from '../shared/records.js';
function validate(body) {
      return [stringField(body.name, 'Item', 160), stringField(body.quantity, 'Quantity', 80, false), boolField(body.done ?? false, 'Done')];
}
function requester(body, personId) {
 if(Object.hasOwn(body,'requester_person_id') && body.requester_person_id!==personId) throw new HttpError(403,'The requester cannot be changed.');
 return personId;
}
export async function handleGroceries(request,env,member,id) {
 const householdId=householdScope(member,'groceries');
 if(request.method==='GET' && !id) {
  // Resolve display names within this list's household, never through the family-wide Directory.
  const {results}=await env.DB.prepare(`SELECT g.id,g.name,g.quantity,g.done,g.created_by,g.created_at,g.updated_at,g.version,g.household_id,g.requester_person_id,
   CASE WHEN p.id IS NOT NULL THEN trim(p.first_name || ' ' || coalesce(p.last_name,'')) END AS requester_name
   FROM grocery_items g LEFT JOIN people p ON p.id=g.requester_person_id AND p.household_id=g.household_id AND p.deleted_at IS NULL
   WHERE g.household_id=? AND g.deleted_at IS NULL ORDER BY g.done ASC,g.created_at ASC,g.id ASC`).bind(householdId).all();
  return jsonResponse({items:results.map(item=>({...item,done:Boolean(item.done)}))});
 }
 if(id==='import') return importGroceries(request,env,member,householdId);
 if(id==='checked' && request.method==='DELETE') {
  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE grocery_items SET deleted_at=?,updated_at=?,version=version+1 WHERE household_id=? AND done=1 AND deleted_at IS NULL').bind(now,now,householdId).run();
  return jsonResponse({ok:true});
 }
 return handleRecords(request,env,member,id,{
  table:'grocery_items',order:'done ASC, created_at ASC, id ASC',fields:['name','quantity','done','requester_person_id'],householdId,
  values(body,current) {return [...validate(body),requester(body,current ? current.requester_person_id : member.person.id)];},
  normalizeUpdate(merged,current,body) {if(!Object.hasOwn(body,'done')) merged.done=Boolean(current.done);}
 });
}
async function importGroceries(request, env, member, householdId) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  const body = await bodyJson(request);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) throw new HttpError(400, 'Import 1–100 items at a time.');
  const now = new Date().toISOString();
  const statements = body.items.map(item => {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'Invalid imported item.');
    const legacyId = stringField(String(item.legacy_id ?? ''), 'Old item ID', 100);
    const values = validate(item);
    return env.DB.prepare('INSERT INTO grocery_items (id, name, quantity, done, created_by, created_at, updated_at, import_key, household_id,requester_person_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(import_key) DO NOTHING')
      .bind(crypto.randomUUID(), ...values, member.id, now, now, JSON.stringify([member.id, legacyId]),householdId,requester(item,member.person.id));
  });
  // D1 batch is transactional. Retries cannot duplicate or resurrect imported records.
  await env.DB.batch(statements);
  return jsonResponse({ ok: true });
}
