import { bodyJson, HttpError, stringField } from './errors.js';
import { jsonResponse, isUuid } from './utils.js';
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
async function directoryRequest(request, env, kind, id) {
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
    if(householdId && (!isUuid(householdId)||!await db.prepare('SELECT id FROM households WHERE id=?').bind(householdId).first()))throw new HttpError(400,'Choose a valid household.');
    values.push(householdId);
    if (request.method === 'POST') {
      const family = await db.prepare('SELECT id FROM families ORDER BY created_at, id LIMIT 1').first();
      if (!family) throw new HttpError(409, 'The family record is missing.');
      record = await db.prepare('INSERT INTO people(id,family_id,first_name,last_name,birth_date,login_email,household_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) RETURNING *').bind(crypto.randomUUID(), family.id, ...values, now, now).first();
    } else {
      record = await db.prepare('UPDATE people SET first_name=?,last_name=?,birth_date=?,login_email=?,household_id=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL RETURNING *').bind(...values, now, id, version(body)).first();
    }
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
export async function handleDirectory(request, env, kind, id) {
  try { return await directoryRequest(request, env, kind, id); }
  catch (error) {
    if (/UNIQUE constraint failed.*(?:idx_people_login_email|people.login_email)/.test(String(error.message))) throw new HttpError(409, 'That login email is already assigned to another family member.');
    const message = String(error.message).match(/directory: ([^\n]+?)(?:\s*: SQLITE|$)/)?.[1];
    if (message) throw new HttpError(409, message);
    throw error;
  }
}
