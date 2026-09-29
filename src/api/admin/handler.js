import {can} from '../shared/permissions.js';
import {HttpError} from '../shared/errors.js';
import {jsonResponse,isUuid} from '../shared/utils.js';

const accounts = `SELECT u.id,u.person_id,u.status,u.role,p.first_name,p.last_name,
 i.login_email AS approved_email,
 CASE WHEN i.id IS NULL THEN 'missing' WHEN i.subject IS NOT NULL AND i.bound_at IS NOT NULL THEN 'bound' ELSE 'awaiting_first_sign_in' END AS identity_state,
 h.name AS household FROM app_users u JOIN people p ON p.id=u.person_id
 LEFT JOIN user_identities i ON i.user_id=u.id
 LEFT JOIN households h ON h.id=p.household_id AND h.deleted_at IS NULL`;
const accountView=r=>({id:r.id,person_id:r.person_id,name:[r.first_name,r.last_name].filter(Boolean).join(' '),status:r.status,role:r.role,approved_email:r.approved_email,identity_state:r.identity_state,household:r.household});
const actions={
 'account.bootstrap':'Initial Administrator provisioned','account.provision':'Application access provisioned',
 'identity.bind':'First sign-in completed','directory.profile.editAny':'Administrator corrected a profile',
 'directory.anniversary.editAny':'Administrator corrected an anniversary',
 'directory.household.assign':'Household assignment changed','directory.relationship.create':'Relationship added',
 'directory.relationship.remove':'Relationship removed','household.create':'Household created',
 'household.rename':'Household renamed','household.retire':'Household retired'
};
function pagination(url) {
 const number=(key,fallback,max)=>{const raw=url.searchParams.get(key);if(raw===null)return fallback;if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>max)throw new HttpError(400,'Invalid pagination.');return Number(raw);};
 const limit=number('limit',20,50),offset=number('offset',0,100000);
 if(!limit)throw new HttpError(400,'Invalid pagination.');
 return {limit,offset};
}
export async function handleAdmin(request,env,member) {
 const url=new URL(request.url),audit=url.pathname==='/api/admin/security-audit';
 if(!can(member,audit?'securityAudit.read':'account.read'))throw new HttpError(403,'Administrator access required.');
 if(request.method!=='GET')throw new HttpError(405,'Read-only endpoint.');
 const route=url.pathname.match(/^\/api\/admin\/accounts(?:\/([^/]+))?$/);
 if(!route&&!audit)throw new HttpError(404,'Not found.');
 const db=env.DB;
 if(route?.[1]) {
  const row=await db.prepare(accounts+' WHERE u.id=?').bind(route[1]).first();
  if(!row)throw new HttpError(404,'Account not found.');
  return jsonResponse({item:accountView(row)});
 }
 const {limit,offset}=pagination(url);
 if(route) {
  const person=url.searchParams.get('person_id');
  if(person!==null&&!isUuid(person))throw new HttpError(400,'Invalid person.');
  const rows=(await db.prepare(accounts+(person?' WHERE u.person_id=?':'')+' ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE,u.id LIMIT ? OFFSET ?').bind(...(person?[person]:[]),limit+1,offset).all()).results;
  return jsonResponse({items:rows.slice(0,limit).map(accountView),next_offset:rows.length>limit?offset+limit:null});
 }
 // Never return raw details, actor labels, identity IDs, subjects, or target IDs.
 const rows=(await db.prepare(`SELECT a.occurred_at,a.action,a.actor_type,p.first_name,p.last_name
 FROM security_audit a LEFT JOIN app_users u ON u.id=a.actor_user_id LEFT JOIN people p ON p.id=u.person_id
 ORDER BY a.occurred_at DESC,a.id DESC LIMIT ? OFFSET ?`).bind(limit+1,offset).all()).results;
 return jsonResponse({items:rows.slice(0,limit).map(r=>({occurred_at:r.occurred_at,action:actions[r.action]||'Security change recorded',actor:r.actor_type==='user'?[r.first_name,r.last_name].filter(Boolean).join(' ')||'Application user':r.actor_type==='bootstrap'?'Initial setup':'System operator'})),next_offset:rows.length>limit?offset+limit:null});
}
