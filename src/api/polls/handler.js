import {bodyJson,HttpError,stringField} from '../shared/errors.js';
import {isUuid,jsonResponse} from '../shared/utils.js';
import {can} from '../shared/permissions.js';
import {householdActor} from './policy.js';
import {notifyPoll} from '../notifications/events.js';
const nowSQL="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const open=`q.closed_at IS NULL AND q.expires_at>${nowSQL}`;
function fields(body,allowed){if(Object.keys(body).some(k=>!allowed.includes(k)))throw new HttpError(400,'Unsupported poll fields.');}
function revision(value){if(!Number.isSafeInteger(value)||value<0)throw new HttpError(400,'Current revision required.');return value;}
export async function handlePolls(request,env,member,ctx){
 const db=env.DB,user=member.account.id,household=member.household?.id;
 if(!household)throw new HttpError(403,'No household assigned. Contact Bob.','HOUSEHOLD_REQUIRED');
 if(!can(member,'poll.create'))throw new HttpError(403,'Polls are unavailable.');
 const url=new URL(request.url),parts=url.pathname.split('/').slice(3),id=parts[0],operation=parts[1],method=request.method;
 const scope=`q.household_id=? AND EXISTS(SELECT 1 FROM poll_recipients r WHERE r.poll_id=q.id AND r.user_id=?) AND ${householdActor}`;
 const args=[household,user,user,household];
 const columns=`q.id,q.question,q.created_at,q.expires_at,q.closed_at,q.version,q.creator_user_id=? AS is_creator,
 (SELECT trim(p.first_name || ' ' || coalesce(p.last_name,'')) FROM app_users cu JOIN people p ON p.id=cu.person_id WHERE cu.id=q.creator_user_id) AS creator_name,
 (${open}) AS active,(SELECT option_id FROM poll_responses WHERE poll_id=q.id AND user_id=?) AS own_option_id,
 (SELECT o.label FROM poll_responses a JOIN poll_options o ON o.poll_id=a.poll_id AND o.id=a.option_id WHERE a.poll_id=q.id AND a.user_id=?) AS own_option_label,
 coalesce((SELECT version FROM poll_responses WHERE poll_id=q.id AND user_id=?),0) AS response_version`;
 async function poll(pollId){return db.prepare(`SELECT ${columns} FROM polls q WHERE q.id=? AND ${scope}`).bind(user,user,user,user,pollId,...args).first();}
 if(method==='GET'&&!operation&&(!id||id==='summary')){
  if(id==='summary'){
   const counts=await db.prepare(`SELECT count(*) active_count,coalesce(sum(NOT EXISTS(SELECT 1 FROM poll_responses a WHERE a.poll_id=q.id AND a.user_id=?)),0) unanswered_count FROM polls q WHERE ${scope} AND ${open}`).bind(user,...args).first();
   const next=await db.prepare(`SELECT q.id,q.question,q.expires_at FROM polls q WHERE ${scope} AND ${open} AND NOT EXISTS(SELECT 1 FROM poll_responses a WHERE a.poll_id=q.id AND a.user_id=?) ORDER BY q.expires_at,q.id LIMIT 1`).bind(...args,user).first();
   return jsonResponse({...counts,next});
  }
  const history=url.searchParams.get('view')==='history',offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new HttpError(400,'Invalid page.');
  const rows=(await db.prepare(`SELECT ${columns} FROM polls q WHERE ${scope} AND ${history?`NOT (${open})`:open}
   ORDER BY ${history?'q.created_at DESC':'own_option_id IS NOT NULL,q.expires_at'},q.id LIMIT 21 OFFSET ?`).bind(user,user,user,user,...args,offset).all()).results;
  return jsonResponse({items:rows.slice(0,20),next_offset:rows.length>20?offset+20:null});
 }
 if(method==='POST'&&!id){
  const body=await bodyJson(request);fields(body,['id','question','options']);
  if(!isUuid(body.id))throw new HttpError(400,'A poll request ID is required.');
  const question=stringField(body.question,'Question',240);
  if(!Array.isArray(body.options)||body.options.length<2||body.options.length>8)throw new HttpError(400,'Provide 2–8 choices.');
  const options=body.options.map(v=>stringField(v,'Choice',100));
  if(new Set(options.map(v=>v.toLocaleLowerCase('en-US'))).size!==options.length)throw new HttpError(400,'Choices must be distinct.');
  async function retry(){
   const existing=await poll(body.id);if(!existing||!existing.is_creator)return null;
   const labels=(await db.prepare('SELECT label FROM poll_options WHERE poll_id=? ORDER BY position').bind(body.id).all()).results.map(x=>x.label);
   return existing.question===question&&JSON.stringify(labels)===JSON.stringify(options)?existing:null;
  }
  if(await db.prepare('SELECT id FROM polls WHERE id=?').bind(body.id).first()){
   const existing=await retry();if(!existing)throw new HttpError(409,'Poll request changed. Start a new poll.');return jsonResponse({item:existing});
  }
  const created=new Date(),now=created.toISOString(),expires=new Date(created.getTime()+7*86400000).toISOString();
  try{await db.batch([
   db.prepare(`INSERT INTO polls(id,household_id,creator_user_id,question,created_at,expires_at,updated_at)
    VALUES(CASE WHEN ${householdActor} THEN ? ELSE NULL END,?,?,?,?,?,?)`).bind(user,household,body.id,household,user,question,now,expires,now),
   ...options.map((label,position)=>db.prepare('INSERT INTO poll_options(poll_id,id,label,position) VALUES(?,?,?,?)').bind(body.id,crypto.randomUUID(),label,position)),
   db.prepare(`INSERT INTO poll_recipients(poll_id,user_id) SELECT ?,u.id FROM app_users u JOIN people p ON p.id=u.person_id
    WHERE u.status='active' AND p.deleted_at IS NULL AND p.household_id=?`).bind(body.id,household)
  ]);}catch{
   const existing=await retry();if(existing)return jsonResponse({item:existing});
   throw new HttpError(409,'Poll could not be created. Refresh and try again.');
  }
  if(ctx?.waitUntil)try{ctx.waitUntil(notifyPoll(env,body.id).catch(()=>console.error('poll-notification failed')));}catch{console.error('poll-notification scheduling failed');}
  return jsonResponse({item:await poll(body.id)},201);
 }
 if(!isUuid(id)||parts.length>2)throw new HttpError(404,'Poll not found.');
 const item=await poll(id);if(!item)throw new HttpError(404,'Poll not found.');
 if(method==='GET'&&(!operation||operation==='results')){
  const options=(await db.prepare('SELECT id,label FROM poll_options WHERE poll_id=? ORDER BY position').bind(id).all()).results;
  const responses=(await db.prepare(`SELECT p.first_name,p.last_name,a.option_id,
   (u.status='active' AND p.deleted_at IS NULL AND p.household_id=?) AS available
   FROM poll_recipients r JOIN app_users u ON u.id=r.user_id JOIN people p ON p.id=u.person_id
   LEFT JOIN poll_responses a ON a.poll_id=r.poll_id AND a.user_id=r.user_id
   WHERE r.poll_id=? ORDER BY p.first_name,p.last_name,r.user_id`).bind(household,id).all()).results;
  return jsonResponse({item:{...item,options,responses}});
 }
 if(method==='PUT'&&operation==='response'){
  const body=await bodyJson(request);fields(body,['option_id','version']);const version=revision(body.version);
  if(!isUuid(body.option_id))throw new HttpError(400,'Choose one answer.');
  const result=await db.prepare(`INSERT INTO poll_responses(poll_id,user_id,option_id,created_at,updated_at)
   SELECT q.id,?,?,${nowSQL},${nowSQL} FROM polls q WHERE q.id=? AND ${scope} AND ${open}
   AND EXISTS(SELECT 1 FROM poll_options o WHERE o.poll_id=q.id AND o.id=?)
   AND coalesce((SELECT version FROM poll_responses WHERE poll_id=q.id AND user_id=?),0)=?
   ON CONFLICT(poll_id,user_id) DO UPDATE SET option_id=excluded.option_id,updated_at=excluded.updated_at,version=version+1 WHERE version=?`)
   .bind(user,body.option_id,id,...args,body.option_id,user,version,version).run();
  if(!result.meta.changes)throw new HttpError(409,'Poll or answer changed or closed. Refresh and try again.');
  return jsonResponse({saved:true});
 }
 if(method==='POST'&&operation==='close'){
  const body=await bodyJson(request);fields(body,['version']);revision(body.version);
  if(!can(member,'poll.closeOwn',{creator_user_id:item.is_creator?user:null,household_id:household}))throw new HttpError(403,'Only the creator can close this poll.');
  const result=await db.prepare(`UPDATE polls AS q SET closed_at=${nowSQL},updated_at=${nowSQL},version=version+1 WHERE q.id=? AND ${scope} AND q.creator_user_id=? AND q.version=? AND ${open}`).bind(id,...args,user,body.version).run();
  if(!result.meta.changes)throw new HttpError(409,'Poll changed or closed. Refresh and try again.');
  return jsonResponse({saved:true});
 }
 throw new HttpError(405,'Method not allowed.');
}
