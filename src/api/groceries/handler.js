import {householdIdentity} from '../shared/identity.js';
import {householdScope} from '../shared/permissions.js';
import {bodyJson,HttpError,stringField} from '../shared/errors.js';
import {jsonResponse} from '../shared/utils.js';
import {boolField,personReference} from '../shared/recordValues.js';
import {handleRecords} from '../shared/records.js';
function validate(body) {
      return [stringField(body.name, 'Item', 160), stringField(body.quantity, 'Quantity', 80, false), boolField(body.done ?? false, 'Done')];
}
export async function handleGroceries(request,env,member,id) {
 const householdId=householdScope(await householdIdentity(env,member),'groceries');
 if(id==='import') return importGroceries(request,env,member,householdId);
 if(id==='checked' && request.method==='DELETE') {
  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE grocery_items SET deleted_at=?,updated_at=?,version=version+1 WHERE household_id=? AND done=1 AND deleted_at IS NULL').bind(now,now,householdId).run();
  return jsonResponse({ok:true});
 }
 return handleRecords(request,env,member,id,{
  table:'grocery_items',order:'done ASC, created_at ASC, id ASC',fields:['name','quantity','done','requester_person_id'],householdId,
  async values(body,current={}) {return [...validate(body),await personReference(env,body.requester_person_id || null,current.requester_person_id)];},
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
    return env.DB.prepare('INSERT INTO grocery_items (id, name, quantity, done, created_by, created_at, updated_at, import_key, household_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(import_key) DO NOTHING')
      .bind(crypto.randomUUID(), ...values, member.id, now, now, JSON.stringify([member.id, legacyId]),householdId);
  });
  // D1 batch is transactional. Retries cannot duplicate or resurrect imported records.
  await env.DB.batch(statements);
  return jsonResponse({ ok: true });
}
