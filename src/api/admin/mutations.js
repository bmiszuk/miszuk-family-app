import {can} from '../shared/permissions.js';
import {bodyJson,HttpError} from '../shared/errors.js';
import {isUuid} from '../shared/utils.js';

function revision(value) {
 if(!Number.isSafeInteger(value)||value<1)throw new HttpError(400,'A current revision is required.');
 return value;
}
function email(value) {
 if(typeof value!=='string')throw new HttpError(400,'Enter a valid login email.');
 const normalized=value.trim().toLowerCase();
 if(normalized.length>254||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(normalized)||normalized.split('@')[0].length>64||normalized.startsWith('.')||normalized.includes('..')||normalized.includes('.@'))throw new HttpError(400,'Enter a valid login email.');
 return normalized;
}
// All guards run inside the D1 batch. NOT NULL constraints abort the transaction;
// failure of the final audit insert rolls back every prior write.
export async function mutateAccount(request,env,member,id,operation) {
 if(!can(member,operation==='role'?'account.role.change':operation==='identity'?'account.identity.replace':'account.'+operation))throw new HttpError(403,'Administrator access required.');
 const body=await bodyJson(request),db=env.DB;
 const keys=operation==='provision'?['person_id','person_version','login_email','confirm_email']:operation==='role'?['version','role']:operation==='identity'?['version','login_email','confirm_email']:['version'];
 if(Object.keys(body).some(key=>!keys.includes(key)))throw new HttpError(400,'Unsupported account fields.');
 const issuer='https://'+env.ACCESS_TEAM_DOMAIN;
 const actor=`EXISTS(SELECT 1 FROM app_users actor JOIN people ap ON ap.id=actor.person_id
 JOIN user_identities ai ON ai.user_id=actor.id WHERE actor.id=? AND actor.status='active'
 AND actor.role='administrator' AND ap.deleted_at IS NULL AND ai.provider='cloudflare_access'
 AND ai.issuer=? AND ai.subject=? AND ai.login_email=? AND ai.bound_at IS NOT NULL)`;
 const actorArgs=[member.account.id,issuer,member.id,member.email.trim().toLowerCase()];
 if(operation==='role'||operation==='identity') {
  const version=revision(body.version);
  const otherAdministrator=`EXISTS(SELECT 1 FROM app_users other JOIN people op ON op.id=other.person_id
   JOIN user_identities oi ON oi.user_id=other.id WHERE other.id<>u.id AND other.status='active'
   AND other.role='administrator' AND op.deleted_at IS NULL AND oi.provider='cloudflare_access'
   AND oi.issuer=? AND length(trim(oi.subject))>0 AND oi.bound_at IS NOT NULL)`;
  const before=await db.prepare('SELECT u.role,u.status,u.version,i.login_email FROM app_users u LEFT JOIN user_identities i ON i.user_id=u.id WHERE u.id=?').bind(id).first();
  if(!before||before.version!==version)throw new HttpError(409,'Account changed. Refresh and review before retrying.');
  let guard,guardArgs,details,assignments,assignmentArgs,identityUpdate;
  if(operation==='role') {
   if(!['member','administrator'].includes(body.role))throw new HttpError(400,'Choose Member or Administrator.');
   guard=`u.role<>? AND (?='administrator' OR ${otherAdministrator})`;
   guardArgs=[body.role,body.role,issuer];
   details={old_role:before.role,new_role:body.role};assignments='role=?';assignmentArgs=[body.role];
  } else {
   if(id===member.account.id)throw new HttpError(403,'Your own login identity requires operator recovery.');
   const approved=email(body.login_email);
   if(approved!==email(body.confirm_email))throw new HttpError(400,'The login emails must match.');
   guard=`u.id<>? AND EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id=u.id
    AND i.provider='cloudflare_access' AND i.issuer=? AND i.login_email<>?)
    AND NOT EXISTS(SELECT 1 FROM user_identities WHERE issuer=? AND login_email=?)`;
   guardArgs=[member.account.id,issuer,approved,issuer,approved];
   details={old_email:before.login_email,new_email:approved,old_status:before.status,new_status:before.status==='disabled'?'disabled':'pending'};
   assignments="status=CASE WHEN status='disabled' THEN 'disabled' ELSE 'pending' END";assignmentArgs=[];
   identityUpdate=db.prepare('UPDATE user_identities SET login_email=?,subject=NULL,bound_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(approved,id);
  }
  // The pre-read only supplies audit metadata. The mutation rechecks the exact
  // revision and all authority/integrity guards transactionally before writing.
  const update=db.prepare(`UPDATE app_users AS u SET version=CASE WHEN ${actor} AND u.version=? AND ${guard}
   THEN version+1 ELSE NULL END,${assignments},updated_at=CURRENT_TIMESTAMP WHERE u.id=?`)
   .bind(...actorArgs,version,...guardArgs,...assignmentArgs,id);
  const audit=db.prepare(`INSERT INTO security_audit(id,actor_type,actor_user_id,action,target_type,target_id,details)
   VALUES(CASE WHEN EXISTS(SELECT 1 FROM app_users WHERE id=? AND version=?) THEN ? ELSE NULL END,
   'user',?,?,'app_user',?,?)`)
   .bind(id,version+1,crypto.randomUUID(),member.account.id,'account.'+operation,id,JSON.stringify(details));
  try {await db.batch([update,...(identityUpdate?[identityUpdate]:[]),audit]);}
  catch(error) {
   if(/NOT NULL constraint failed|UNIQUE constraint failed/.test(String(error.message)))throw new HttpError(409,'Account changed, identity is reserved, or another usable Administrator is required. Refresh and review before retrying.');
   throw error;
  }
  return id;
 }
 let target=id,statements=[],expectedVersion,details;
 if(operation==='provision') {
  if(!isUuid(body.person_id))throw new HttpError(400,'Choose an existing Directory person.');
  const version=revision(body.person_version),approved=email(body.login_email);
  if(approved!==email(body.confirm_email))throw new HttpError(400,'The login emails must match.');
  target=crypto.randomUUID();expectedVersion=1;details={status:'pending',role:'member'};
  statements.push(db.prepare(`INSERT INTO app_users(id,person_id,status,role)
 VALUES(CASE WHEN ${actor} AND EXISTS(SELECT 1 FROM people WHERE id=? AND version=? AND deleted_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM app_users WHERE person_id=?)
 AND NOT EXISTS(SELECT 1 FROM user_identities WHERE issuer=? AND login_email=?)
 THEN ? ELSE NULL END,?,'pending','member')`).bind(...actorArgs,body.person_id,version,body.person_id,issuer,approved,target,body.person_id));
  statements.push(db.prepare(`INSERT INTO user_identities(id,user_id,provider,issuer,login_email)
 VALUES(?,?,'cloudflare_access',?,?)`).bind(crypto.randomUUID(),target,issuer,approved));
 } else {
  const version=revision(body.version);expectedVersion=version+1;details={};
  const validIdentity=`EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id=app_users.id
 AND i.provider='cloudflare_access' AND i.issuer=? AND i.login_email=lower(trim(i.login_email))
 AND ((i.subject IS NOT NULL AND length(trim(i.subject))>0 AND i.bound_at IS NOT NULL)
 OR (i.subject IS NULL AND i.bound_at IS NULL)))`;
  const otherAdministrator=`EXISTS(SELECT 1 FROM app_users other JOIN people op ON op.id=other.person_id
 JOIN user_identities oi ON oi.user_id=other.id WHERE other.id<>app_users.id
 AND other.status='active' AND other.role='administrator' AND op.deleted_at IS NULL
 AND oi.provider='cloudflare_access' AND oi.issuer=? AND oi.subject IS NOT NULL
 AND length(trim(oi.subject))>0 AND oi.bound_at IS NOT NULL)`;
  const guard=operation==='disable'
   ? `status IN ('active','pending') AND (role<>'administrator' OR status<>'active' OR ${otherAdministrator})`
   : `status='disabled' AND EXISTS(SELECT 1 FROM people WHERE id=app_users.person_id AND deleted_at IS NULL) AND ${validIdentity}`;
  const status=operation==='disable'?"'disabled'":`CASE WHEN EXISTS(SELECT 1 FROM user_identities WHERE user_id=app_users.id AND subject IS NOT NULL AND bound_at IS NOT NULL) THEN 'active' ELSE 'pending' END`;
  statements.push(db.prepare(`UPDATE app_users SET version=CASE WHEN ${actor} AND version=? AND ${guard}
 THEN version+1 ELSE NULL END,status=${status},updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...actorArgs,version,issuer,target));
 }
 // Catch missing targets (zero-row UPDATE) without rejecting a permitted self-
 // disable after the actor's status changed. The mutation already checked authority.
 statements.push(db.prepare(`INSERT INTO security_audit(id,actor_type,actor_user_id,action,target_type,target_id,details)
 VALUES(CASE WHEN EXISTS(SELECT 1 FROM app_users WHERE id=? AND version=?) THEN ? ELSE NULL END,
 'user',?,?,'app_user',?,?)`).bind(target,expectedVersion,crypto.randomUUID(),member.account.id,'account.'+operation,target,JSON.stringify(details)));
 try {await db.batch(statements);}
 catch(error) {
  if(/NOT NULL constraint failed: (app_users|security_audit)|UNIQUE constraint failed/.test(String(error.message)))throw new HttpError(409,'Account or person changed, identity is reserved, or this would disable the last usable Administrator. Refresh and review before retrying.');
  throw error;
 }
 return target;
}
