import { bodyJson, HttpError, stringField } from '../shared/errors.js';
import { jsonResponse, isUuid } from '../shared/utils.js';
import {privilegedAudit} from '../shared/securityAudit.js';
import {can} from '../shared/permissions.js';
import { saveDirectoryPerson } from './savePerson.js';
import { parseFamilyDate, chicagoDate } from '../../domain/directoryDates.js';

function dateField(value, required = true) {
  if (!required && !value) return null;
  const parsed = parseFamilyDate(value);
  if (!parsed) throw new HttpError(400, 'Enter a valid month and day; the year is optional.');
  if (parsed.year && value > chicagoDate()) throw new HttpError(400, 'A birth or wedding date cannot be in the future.');
  return value;
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
  const identity = member;
  const actor = identity.person;
  const permissions = actor ? (await db.prepare('SELECT * FROM relationships WHERE deleted_at IS NULL AND (person1_id=? OR person2_id=?)').bind(actor.id,actor.id).all()).results : [];
  const canEdit = personId => can(identity,'directory.profile.edit',{id:personId},{relationships:permissions});
  const audits=[];
  const audit=(action,type,target,details={})=>audits.push({action,type,target,details});
  const administrator=can(identity,'directory.profile.editAny');
  const requireRelationship = async (relationship,operation) => {
    if(operation==='anniversary') {
      if(can(identity,'directory.anniversary.edit',relationship,{relationships:permissions})) return;
      if(can(identity,'directory.anniversary.editAny')) {audit('directory.anniversary.editAny','relationship',relationship.id);return;}
    } else if(can(identity,'directory.relationship.manage')) {
      audit('directory.relationship.'+operation,'relationship',relationship.id,{person1_id:relationship.person1_id,person2_id:relationship.person2_id,relationship_type:relationship.relationship_type});return;
    }
    throw new HttpError(403,'You do not have permission to change this relationship.');
  };
  if (kind === 'people' && id && !canEdit(id)) {
    if(request.method==='PATCH' && administrator) audit('directory.profile.editAny','person',id,{fields:['first_name','last_name','birth_date'].filter(key=>Object.hasOwn(body,key))});
    else throw new HttpError(403,'You can edit only yourself, your children, or your spouse.');
  }
  if (kind === 'relationships') {
    const relationship = id ? await db.prepare('SELECT * FROM relationships WHERE id=? AND deleted_at IS NULL').bind(id).first() : body;
    if (!relationship) throw new HttpError(409,'This relationship was removed.');
    if (!id && (!isUuid(body.person1_id) || !isUuid(body.person2_id) || body.person1_id===body.person2_id)) throw new HttpError(400,'Choose two different people.');
    if(!id) relationship.id=crypto.randomUUID();
    await requireRelationship(relationship,request.method==='PATCH'?'anniversary':request.method==='DELETE'?'remove':'create');
  }
  const createdRelationshipId=audits.find(a=>a.action==='directory.relationship.create')?.target;
  const now = new Date().toISOString();
  let record;
  async function execute(statement,table,targetId,condition) {
    if(audits.length) {await db.batch([...audits.map(a=>privilegedAudit(db,member,a.action,a.type,a.target,a.details,condition)),statement]);
      return db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(targetId).first();}
    return statement.first();
  }
  if (request.method === 'DELETE') {
    record = await execute(db.prepare(`UPDATE ${kind} SET deleted_at=?, updated_at=?, version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL ${kind === 'people' ? 'AND NOT EXISTS(SELECT 1 FROM app_users WHERE person_id=people.id)' : ''} RETURNING *`).bind(now, now, id, version(body)),kind,id,{sql:`EXISTS(SELECT 1 FROM ${kind} WHERE id=? AND version=? AND deleted_at IS NULL)`,args:[id,body.version]});
  } else if (kind === 'people') {
    const values = [stringField(body.first_name, 'First name', 100), stringField(body.last_name, 'Last name', 100, false), dateField(body.birth_date, false)];
    const email = id ? (await db.prepare('SELECT login_email FROM people WHERE id=?').bind(id).first())?.login_email || null : null;
    if (Object.hasOwn(body,'login_email') && (body.login_email || null) !== email) throw new HttpError(403,'Login email is managed separately from Directory profiles.');
    values.push(email);
    const householdId=Object.hasOwn(body,'household_id') ? body.household_id || null : id ? (await db.prepare('SELECT household_id FROM people WHERE id=?').bind(id).first())?.household_id || null : null;
    if(householdId && (!isUuid(householdId)||!await db.prepare('SELECT id FROM households WHERE id=? AND deleted_at IS NULL').bind(householdId).first()))throw new HttpError(400,'Choose a valid household.');
    const priorHousehold=id?(await db.prepare('SELECT household_id FROM people WHERE id=?').bind(id).first())?.household_id || null:null;
    if(householdId!==priorHousehold) {
      if(!can(identity,'directory.household.assign')) throw new HttpError(403,'Only an Administrator can assign households.');
      audit('directory.household.assign','person',id,{from:priorHousehold,to:householdId});
    }
    values.push(householdId);
    if (id) version(body);
    record = await saveDirectoryPerson({db,id,body,values,now,dateField,requireRelationship,audits,member});
  } else if (request.method === 'POST') {
    if (!['spouse', 'parent'].includes(body.relationship_type)) throw new HttpError(400, 'Choose spouse or parent/child.');
    if (!isUuid(body.person1_id) || !isUuid(body.person2_id) || body.person1_id === body.person2_id) throw new HttpError(400, 'Choose two different people.');
    const pair = body.relationship_type === 'spouse' ? [body.person1_id, body.person2_id].sort() : [body.person1_id, body.person2_id];
    const person = await db.prepare('SELECT family_id FROM people WHERE id=? AND deleted_at IS NULL').bind(pair[0]).first();
    if (!person) throw new HttpError(409, 'This person was removed. Refresh the directory.');
    record = await execute(db.prepare('INSERT INTO relationships(id,family_id,person1_id,person2_id,relationship_type,anniversary_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) RETURNING *')
      .bind(createdRelationshipId, person.family_id, ...pair, body.relationship_type, body.relationship_type === 'spouse' ? dateField(body.anniversary_date, false) : null, now, now),'relationships',createdRelationshipId,{sql:'1',args:[]});
  } else {
    record = await execute(db.prepare("UPDATE relationships SET anniversary_date=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL AND relationship_type='spouse' RETURNING *")
      .bind(dateField(body.anniversary_date, false), now, id, version(body)),'relationships',id,{sql:"EXISTS(SELECT 1 FROM relationships WHERE id=? AND version=? AND deleted_at IS NULL AND relationship_type='spouse')",args:[id,body.version]});
  }
  if (!record) throw new HttpError(409, 'Someone changed this record. Refresh and reopen it before trying again.');
  return jsonResponse(request.method === 'DELETE' ? { ok: true } : { item: record }, request.method === 'POST' ? 201 : 200);
}
export async function handleDirectory(request, env, kind, id, member) {
  try { return await directoryRequest(request, env, kind, id, member); }
  catch (error) {
    if (/NOT NULL constraint failed: security_audit.id/.test(String(error.message))) throw new HttpError(409,'Permission or record changed. Refresh and try again.');
    if (/UNIQUE constraint failed.*(?:idx_people_login_email|people.login_email)/.test(String(error.message))) throw new HttpError(409, 'That login email is already assigned to another family member.');
    if (/NOT NULL constraint failed: people.version/.test(String(error.message))) throw new HttpError(409,'Someone changed this record. Refresh and reopen it.');
    const message = String(error.message).match(/directory: ([^\n]+?)(?:\s*: SQLITE|$)/)?.[1];
    if (message) throw new HttpError(409, message);
    throw error;
  }
}
