import {bodyJson,HttpError} from './errors.js';
import {jsonResponse,isUuid} from './utils.js';
import {householdIdentity} from './households.js';
import {validDay,weekStart,addDays} from '../dinnerDates.js';
export async function handleDinner(request,env,member,day) {
  const identity=await householdIdentity(env,member),householdId=identity.household.id;
  if(request.method==='GET'&&!day){
    const start=new URL(request.url).searchParams.get('start')||weekStart();
    if(!validDay(start))throw new HttpError(400,'Choose a valid week.');
    const rows=await env.DB.prepare('SELECT * FROM dinner_signups WHERE household_id=? AND day>=? AND day<=? ORDER BY day').bind(householdId,start,addDays(start,6)).all();
    return jsonResponse({items:rows.results});
  }
  if(request.method!=='PUT'||!validDay(day))throw new HttpError(400,'Choose a valid dinner date.');
  if(!identity.person?.household_id)throw new HttpError(409,'Assign your Directory person to a household first.');
  const body=await bodyJson(request);
  if(!Number.isSafeInteger(body.version)||body.version<0)throw new HttpError(400,'A record version is required.');
  const personId=body.person_id ?? null;
  if(personId!==null && (!isUuid(personId)||!await env.DB.prepare('SELECT id FROM people WHERE id=? AND household_id=? AND deleted_at IS NULL').bind(personId,householdId).first()))throw new HttpError(400,'Choose a person in your household.');
  const now=new Date().toISOString();
  const row=body.version===0
    ?await env.DB.prepare('INSERT INTO dinner_signups(household_id,day,person_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(household_id,day) DO NOTHING RETURNING *').bind(householdId,day,personId,now).first()
    :await env.DB.prepare('UPDATE dinner_signups SET person_id=?,updated_at=?,version=version+1 WHERE household_id=? AND day=? AND version=? RETURNING *').bind(personId,now,householdId,day,body.version).first();
  if(!row)throw new HttpError(409,'Dinner changed. Refresh and try again.');
  return jsonResponse({item:row});
}
