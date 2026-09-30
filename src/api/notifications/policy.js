import {HttpError} from '../shared/errors.js';
export const categories=['chat','polls','dinner','calendar','family_dates','vehicles'];
export function rollout(env,userId) {
 // Config routes run after requireAccount; enrollment and sends additionally
 // recheck eligibleAccount in SQL. This switch never authenticates an account.
 const allowed=Boolean(userId)&&(env.NOTIFICATIONS_AUDIENCE==='active_accounts'||String(env.NOTIFICATIONS_ALLOWED_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(userId));
 const configured=Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_KEY_ID&&env.VAPID_SUBJECT==='mailto:bob@miszuk.com');
 return {enrollment_allowed:allowed&&configured&&env.NOTIFICATIONS_ENROLLMENT_ENABLED==='true',sending_allowed:allowed&&configured&&env.NOTIFICATIONS_SENDING_ENABLED==='true'};
}
export function requireRollout(env,id,sending=false) {
 if(!rollout(env,id)[sending?'sending_allowed':'enrollment_allowed'])throw new HttpError(403,'Notifications are not available yet.','NOTIFICATIONS_UNAVAILABLE');
}
export function exactFields(body,keys) {
 if(Object.keys(body).some(k=>!keys.includes(k)))throw new HttpError(400,'Unsupported notification fields.');
}
export function revision(value){if(!Number.isSafeInteger(value)||value<1)throw new HttpError(400,'Current revision required.');return value;}
export function validateEndpoint(value) {
 let url;try{url=new URL(value);}catch{throw new HttpError(400,'Invalid subscription.');}
 const host=url.hostname;
 const allowed=host==='fcm.googleapis.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host==='updates.push.services.mozilla.com';
 if(typeof value!=='string'||value.length>2048||url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!allowed)throw new HttpError(400,'Unsupported push service.');
 return url.href;
}
export async function subscriptionInput(body) {
 exactFields(body,['subscription','device_label']);const s=body.subscription;
 if(!s||typeof s!=='object'||Array.isArray(s))throw new HttpError(400,'Invalid subscription.');
 exactFields(s,['endpoint','expirationTime','keys']);
 if(!s.keys||typeof s.keys!=='object'||Array.isArray(s.keys))throw new HttpError(400,'Invalid subscription.');exactFields(s.keys,['p256dh','auth']);
 const {p256dh,auth}=s.keys;
 if(typeof p256dh!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(p256dh)||typeof auth!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(auth))throw new HttpError(400,'Invalid subscription keys.');
 for(const key of [p256dh,auth])if(btoa(atob(key.replaceAll('-','+').replaceAll('_','/'))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')!==key)throw new HttpError(400,'Invalid subscription keys.');
 try {const bytes=Uint8Array.from(atob(p256dh.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));if(bytes[0]!==4)throw new Error();await crypto.subtle.importKey('raw',bytes,{name:'ECDH',namedCurve:'P-256'},false,[]);}catch{throw new HttpError(400,'Invalid subscription keys.');}
 const expiration=s.expirationTime??null;
 if(expiration!==null&&(!Number.isSafeInteger(expiration)||expiration<=Date.now()))throw new HttpError(400,'Expired subscription.');
 const label=body.device_label??'';if(typeof label!=='string'||label.length>80)throw new HttpError(400,'Device label is too long.');
 return {endpoint:validateEndpoint(s.endpoint),p256dh,auth,expiration,label:label.trim()};
}
// Always rechecked for enrollment and each outbound send, independent of request gate.
export const eligibleAccount=`EXISTS(SELECT 1 FROM app_users u JOIN people p ON p.id=u.person_id JOIN user_identities i ON i.user_id=u.id
 WHERE u.id=? AND u.status='active' AND p.deleted_at IS NULL AND i.provider='cloudflare_access' AND i.issuer=? AND length(trim(i.subject))>0 AND i.bound_at IS NOT NULL)`;
export const eligibilityArgs=(env,id)=>[id,'https://'+env.ACCESS_TEAM_DOMAIN];
