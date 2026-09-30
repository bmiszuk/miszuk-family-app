import {mutateAccount} from './mutations.js';
import {can} from '../shared/permissions.js';
import {HttpError} from '../shared/errors.js';
import {jsonResponse,isUuid} from '../shared/utils.js';

const accounts = `SELECT u.id,u.person_id,u.status,u.role,u.version,p.first_name,p.last_name,
 i.login_email AS approved_email,
 CASE WHEN i.id IS NULL THEN 'missing' WHEN i.subject IS NOT NULL AND i.bound_at IS NOT NULL THEN 'bound' ELSE 'awaiting_first_sign_in' END AS identity_state,
 h.name AS household FROM app_users u JOIN people p ON p.id=u.person_id
 LEFT JOIN user_identities i ON i.user_id=u.id
 LEFT JOIN households h ON h.id=p.household_id AND h.deleted_at IS NULL`;
const accountView=(r,member)=>({is_self:r.id===member.account.id,id:r.id,person_id:r.person_id,name:[r.first_name,r.last_name].filter(Boolean).join(' '),status:r.status,role:r.role,version:r.version,approved_email:r.approved_email,identity_state:r.identity_state,household:r.household});
const actions={
 'account.bootstrap':'Initial Administrator provisioned','account.provision':'Application access provisioned',
 'account.role':'Account role changed','account.identity':'Approved login identity replaced',
 'account.disable':'Application access disabled','account.enable':'Application access enabled',
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
function changeView(row) {
 if(!['account.role','account.identity'].includes(row.action))return {};
 let d;try{d=JSON.parse(row.details);}catch{return {};}
 if(!d||typeof d!=='object')return {};
 const roles={member:'Member',administrator:'Administrator'};
 const validEmail=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
 const change=row.action==='account.role'&&roles[d.old_role]&&roles[d.new_role]
  ? `${roles[d.old_role]} → ${roles[d.new_role]}`
  : row.action==='account.identity'&&validEmail(d.old_email)&&validEmail(d.new_email)?`${d.old_email} → ${d.new_email}`:null;
 return change?{target:[row.target_first,row.target_last].filter(Boolean).join(' ')||'Application account',change}:{};
}
export async function handleAdmin(request,env,member) {
 const url=new URL(request.url),audit=url.pathname==='/api/admin/security-audit';
 if(!can(member,audit?'securityAudit.read':'account.read'))throw new HttpError(403,'Administrator access required.');
 if(request.method!=='GET') {
  const mutation=url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/(enable|disable|role|identity)$/);
  if(request.method!=='POST'||(!mutation&&url.pathname!=='/api/admin/accounts'))throw new HttpError(405,'Method not allowed.');
  const id=await mutateAccount(request,env,member,mutation?.[1],mutation?.[2]||'provision');
  const row=await env.DB.prepare(accounts+' WHERE u.id=?').bind(id).first();
  return jsonResponse({item:accountView(row,member)},mutation?200:201);
 }
 const route=url.pathname.match(/^\/api\/admin\/accounts(?:\/([^/]+))?$/);
 if(!route&&!audit)throw new HttpError(404,'Not found.');
 const db=env.DB;
 if(route?.[1]) {
  const row=await db.prepare(accounts+' WHERE u.id=?').bind(route[1]).first();
  if(!row)throw new HttpError(404,'Account not found.');
  return jsonResponse({item:accountView(row,member)});
 }
 const {limit,offset}=pagination(url);
 if(route) {
  const person=url.searchParams.get('person_id');
  if(person!==null&&!isUuid(person))throw new HttpError(400,'Invalid person.');
  const rows=(await db.prepare(accounts+(person?' WHERE u.person_id=?':'')+' ORDER BY p.last_name COLLATE NOCASE,p.first_name COLLATE NOCASE,u.id LIMIT ? OFFSET ?').bind(...(person?[person]:[]),limit+1,offset).all()).results;
  return jsonResponse({items:rows.slice(0,limit).map(r=>accountView(r,member)),next_offset:rows.length>limit?offset+limit:null});
 }
 // Never return raw details, actor labels, identity IDs, subjects, or target IDs.
 const rows=(await db.prepare(`SELECT a.occurred_at,a.action,a.actor_type,a.details,p.first_name,p.last_name,tp.first_name AS target_first,tp.last_name AS target_last
 FROM security_audit a LEFT JOIN app_users u ON u.id=a.actor_user_id LEFT JOIN people p ON p.id=u.person_id
 LEFT JOIN app_users tu ON a.target_type='app_user' AND tu.id=a.target_id LEFT JOIN people tp ON tp.id=tu.person_id
 ORDER BY a.occurred_at DESC,a.id DESC LIMIT ? OFFSET ?`).bind(limit+1,offset).all()).results;
 return jsonResponse({items:rows.slice(0,limit).map(r=>({...changeView(r),occurred_at:r.occurred_at,action:actions[r.action]||'Security change recorded',actor:r.actor_type==='user'?[r.first_name,r.last_name].filter(Boolean).join(' ')||'Application user':r.actor_type==='bootstrap'?'Initial setup':'System operator'})),next_offset:rows.length>limit?offset+limit:null});
}
