import { bodyJson, HttpError, stringField } from './errors.js';
import { jsonResponse, isUuid } from './utils.js';
import { canEditDirectoryPerson } from '../directoryPermissions.js';
import { householdIdentity } from './households.js';
import { saveDirectoryPerson } from './directorySave.js';
import { parseFamilyDate, chicagoDate } from '../directoryDates.js';

function dateField(value, required = true) {
  if (!required && !value) return null;
  const parsed = parseFamilyDate(value);
  if (!parsed) throw new HttpError(400, 'Enter a valid month and day; the year is optional.');
  if (parsed.year && value > chicagoDate()) throw new HttpError(400, 'A birth or wedding date cannot be in the future.');
  return value;
}
function loginEmail(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Enter a valid login email.');
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid login email.');
  return email;
}
function version(body) {
  if (!Number.isSafeInteger(body.version) || body.version < 1) throw new HttpError(400, 'A record version is required.');
  return body.version;
}
async function directoryRequest(request, env, kind, id, member) {
  const db = env.DB;
  if (id && !isUuid(id)) throw new HttpError(404, 'Not found.');
  if (request.method === 'GET' && !kind) {
    const people = await db.prepare('SELECT * FROM people WHERE deleted_at IS NULL ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, id').all();
    const relationships = await db.prepare('SELECT * FROM relationships WHERE deleted_at IS NULL ORDER BY created_at, id').all();
    return jsonResponse({ people: people.results, relationships: relationships.results });
  }
  if (!['people', 'relationships'].includes(kind)) throw new HttpError(404, 'Not found.');
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method) || (request.method === 'POST' ? Boolean(id) : !id)) throw new HttpError(405, 'Method not allowed.');
  const body = await bodyJson(request);
  const actor = (await householdIdentity(env,member)).person;
  const permissions = actor ? (await db.prepare('SELECT * FROM relationships WHERE deleted_at IS NULL AND (person1_id=? OR person2_id=?)').bind(actor.id,actor.id).all()).results : [];
  const canEdit = personId => canEditDirectoryPerson(actor?.id,personId,permissions);
  const requireRelationship = async relationship => {
    const allowed = relationship.relationship_type === 'parent' ? await canEdit(relationship.person2_id) : await canEdit(relationship.person1_id) || await canEdit(relationship.person2_id);
    if (!allowed) throw new HttpError(403,'You can change relationships only for yourself, your children, or your spouse.');
  };
  if (kind === 'people' && id && !await canEdit(id)) throw new HttpError(403,'You can edit only yourself, your children, or your spouse.');
  if (kind === 'relationships') {
    const relationship = id ? await db.prepare('SELECT * FROM relationships WHERE id=? AND deleted_at IS NULL').bind(id).first() : body;
    if (!relationship) throw new HttpError(409,'This relationship was removed.');
    if (!id && (!isUuid(body.person1_id) || !isUuid(body.person2_id) || body.person1_id===body.person2_id)) throw new HttpError(400,'Choose two different people.');
    await requireRelationship(relationship);
  }
  const now = new Date().toISOString();
  let record;
  if (request.method === 'DELETE') {
    record = await db.prepare(`UPDATE ${kind} SET deleted_at=?, updated_at=?, version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL RETURNING *`).bind(now, now, id, version(body)).first();
  } else if (kind === 'people') {
    const values = [stringField(body.first_name, 'First name', 100), stringField(body.last_name, 'Last name', 100, false), dateField(body.birth_date, false)];
    let email = null;
    if (Object.hasOwn(body, 'login_email')) email = loginEmail(body.login_email);
    else if (id) email = (await db.prepare('SELECT login_email FROM people WHERE id=?').bind(id).first())?.login_email || null;
    values.push(email);
    const householdId=Object.hasOwn(body,'household_id') ? body.household_id || null : id ? (await db.prepare('SELECT household_id FROM people WHERE id=?').bind(id).first())?.household_id || null : null;
    if(householdId && (!isUuid(householdId)||!await db.prepare('SELECT id FROM households WHERE id=? AND deleted_at IS NULL').bind(householdId).first()))throw new HttpError(400,'Choose a valid household.');
    values.push(householdId);
    if (id) version(body);
    record = await saveDirectoryPerson({db,id,body,values,now,dateField,requireRelationship});
  } else if (request.method === 'POST') {
    if (!['spouse', 'parent'].includes(body.relationship_type)) throw new HttpError(400, 'Choose spouse or parent/child.');
    if (!isUuid(body.person1_id) || !isUuid(body.person2_id) || body.person1_id === body.person2_id) throw new HttpError(400, 'Choose two different people.');
    const pair = body.relationship_type === 'spouse' ? [body.person1_id, body.person2_id].sort() : [body.person1_id, body.person2_id];
    const person = await db.prepare('SELECT family_id FROM people WHERE id=? AND deleted_at IS NULL').bind(pair[0]).first();
    if (!person) throw new HttpError(409, 'This person was removed. Refresh the directory.');
    record = await db.prepare('INSERT INTO relationships(id,family_id,person1_id,person2_id,relationship_type,anniversary_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) RETURNING *')
      .bind(crypto.randomUUID(), person.family_id, ...pair, body.relationship_type, body.relationship_type === 'spouse' ? dateField(body.anniversary_date, false) : null, now, now).first();
  } else {
    record = await db.prepare("UPDATE relationships SET anniversary_date=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL AND relationship_type='spouse' RETURNING *")
      .bind(dateField(body.anniversary_date, false), now, id, version(body)).first();
  }
  if (!record) throw new HttpError(409, 'Someone changed this record. Refresh and reopen it before trying again.');
  return jsonResponse(request.method === 'DELETE' ? { ok: true } : { item: record }, request.method === 'POST' ? 201 : 200);
}
export async function handleDirectory(request, env, kind, id, member) {
  try { return await directoryRequest(request, env, kind, id, member); }
  catch (error) {
    if (/UNIQUE constraint failed.*(?:idx_people_login_email|people.login_email)/.test(String(error.message))) throw new HttpError(409, 'That login email is already assigned to another family member.');
    if (/NOT NULL constraint failed: people.version/.test(String(error.message))) throw new HttpError(409,'Someone changed this record. Refresh and reopen it.');
    const message = String(error.message).match(/directory: ([^\n]+?)(?:\s*: SQLITE|$)/)?.[1];
    if (message) throw new HttpError(409, message);
    throw error;
  }
}
