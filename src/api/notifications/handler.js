import {can} from '../shared/permissions.js';
import {bodyJson,HttpError} from '../shared/errors.js';
import {jsonResponse} from '../shared/utils.js';
import {rollout,requireRollout,categories,exactFields,revision,subscriptionInput,eligibleAccount,eligibilityArgs} from './policy.js';
import {sendTest} from './sender.js';
const view=r=>({id:r.id,device_label:r.device_label,enabled:Boolean(r.enabled),version:r.version,created_at:r.created_at,last_seen_at:r.last_seen_at,last_result:r.last_result});
export async function handleNotifications(request,env,member) {
 const path=new URL(request.url).pathname,method=request.method,userId=member.account.id,db=env.DB;
 const device=path.match(/^\/api\/notifications\/subscriptions\/([^/]+)$/);
 const action=path.endsWith('/test')?'notification.test.sendOwn':path.endsWith('/preferences')?(method==='GET'?'notification.preferences.readOwn':'notification.preferences.updateOwn'):method==='GET'?'notification.settings.readOwn':'notification.subscription.manageOwn';
 if(!can(member,action))throw new HttpError(403,'Not allowed.');
 if(path==='/api/notifications/config'&&method==='GET'){
  const state=rollout(env,userId);return jsonResponse({...state,public_key:state.enrollment_allowed?env.VAPID_PUBLIC_KEY:null,key_id:state.enrollment_allowed?env.VAPID_KEY_ID:null});
 }
 if(path==='/api/notifications/subscriptions'&&method==='GET')return jsonResponse({items:(await db.prepare('SELECT id,device_label,enabled,version,created_at,last_seen_at,last_result FROM push_subscriptions WHERE user_id=? ORDER BY created_at,id LIMIT 20').bind(userId).all()).results.map(view)});
 if(device&&method==='DELETE'){
  await db.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?').bind(device[1],userId).run();return jsonResponse({removed:true});
 }
 if(path==='/api/notifications/subscriptions'&&method==='POST'){
  requireRollout(env,userId);const value=await subscriptionInput(await bodyJson(request));
  const existing=await db.prepare('SELECT id,user_id,p256dh,auth,vapid_key_id,enabled FROM push_subscriptions WHERE endpoint=?').bind(value.endpoint).first();
  if(existing&&(existing.user_id!==userId||existing.p256dh!==value.p256dh||existing.auth!==value.auth||existing.vapid_key_id!==env.VAPID_KEY_ID||!existing.enabled))throw new HttpError(409,'Subscription cannot be reused. Disable this browser subscription and enable it again.');
  try {
   const write=await db.prepare(`INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,vapid_key_id,device_label,expiration_time)
    SELECT ?,?,?,?,?,?,?,? WHERE ${eligibleAccount} AND (EXISTS(SELECT 1 FROM push_subscriptions WHERE endpoint=? AND user_id=?) OR (SELECT count(*) FROM push_subscriptions WHERE user_id=?)<10)
    ON CONFLICT(endpoint) DO UPDATE SET device_label=excluded.device_label,expiration_time=excluded.expiration_time,last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE user_id=excluded.user_id AND p256dh=excluded.p256dh AND auth=excluded.auth AND vapid_key_id=excluded.vapid_key_id AND enabled=1`)
    .bind(crypto.randomUUID(),userId,value.endpoint,value.p256dh,value.auth,env.VAPID_KEY_ID,value.label,value.expiration,...eligibilityArgs(env,userId),value.endpoint,userId,userId).run();
   if(!write.meta.changes)throw new HttpError(409,'Subscription could not be registered.');
  }catch{throw new HttpError(409,'Subscription could not be registered.');}
  const row=await db.prepare('SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=? AND enabled=1').bind(value.endpoint,userId).first();
  if(!row||row.p256dh!==value.p256dh||row.auth!==value.auth||row.vapid_key_id!==env.VAPID_KEY_ID)throw new HttpError(409,'Subscription could not be registered.');
  return jsonResponse({item:view(row)});
 }
 if(path==='/api/notifications/preferences'&&method==='GET'){
  const row=await db.prepare('SELECT categories,version FROM notification_preferences WHERE user_id=?').bind(userId).first();
  return jsonResponse({categories:Object.fromEntries(categories.map(k=>[k,row?JSON.parse(row.categories)[k]===true:false])),version:row?.version??0});
 }
 if(path==='/api/notifications/preferences'&&method==='PATCH'){
  const body=await bodyJson(request);exactFields(body,['categories','version']);
  if(!body.categories||typeof body.categories!=='object'||Array.isArray(body.categories))throw new HttpError(400,'Invalid preferences.');
  exactFields(body.categories,categories);if(Object.values(body.categories).some(v=>typeof v!=='boolean'))throw new HttpError(400,'Invalid preferences.');
  if(!Number.isSafeInteger(body.version)||body.version<0)throw new HttpError(400,'Current revision required.');
  const result=body.version===0?await db.prepare('INSERT INTO notification_preferences(user_id,categories) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING').bind(userId,JSON.stringify(body.categories)).run():await db.prepare('UPDATE notification_preferences SET categories=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND version=?').bind(JSON.stringify(body.categories),userId,revision(body.version)).run();
  if(!result.meta.changes)throw new HttpError(409,'Preferences changed. Refresh and try again.');
  return jsonResponse({saved:true});
 }
 if(path==='/api/notifications/test'&&method==='POST'){
  requireRollout(env,userId,true);const body=await bodyJson(request);exactFields(body,['subscription_id']);
  if(typeof body.subscription_id!=='string'||body.subscription_id.length>100)throw new HttpError(400,'Choose this device.');
  return jsonResponse(await sendTest(env,userId,body.subscription_id));
 }
 throw new HttpError(405,'Method not allowed.');
}
