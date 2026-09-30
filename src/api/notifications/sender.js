import {deliverPush} from './transport.js';
import {requireRollout,eligibleAccount,eligibilityArgs,validateEndpoint} from './policy.js';
import {HttpError} from '../shared/errors.js';
export async function sendTest(env,userId,id) {
 requireRollout(env,userId,true);
 const db=env.DB;
 const row=await db.prepare(`SELECT * FROM push_subscriptions WHERE id=? AND user_id=? AND enabled=1
 AND (expiration_time IS NULL OR expiration_time>?) AND ${eligibleAccount}`).bind(id,userId,Date.now(),...eligibilityArgs(env,userId)).first();
 if(!row)throw new HttpError(404,'Device is not available.');
 if(row.vapid_key_id!==env.VAPID_KEY_ID)throw new HttpError(409,'Enable notifications again on this device.');
 validateEndpoint(row.endpoint);
 // One test per account per minute, claimed atomically before an outbound request.
 const now=Date.now();
 const claim=await db.prepare(`INSERT INTO notification_preferences(user_id,last_test_at)
 SELECT ?,? WHERE ${eligibleAccount}
 ON CONFLICT(user_id) DO UPDATE SET last_test_at=excluded.last_test_at WHERE last_test_at IS NULL OR last_test_at<=?`)
 .bind(userId,now,...eligibilityArgs(env,userId),now-60000).run();
 if(!claim.meta.changes)throw new HttpError(429,'Wait a minute before sending another test.');
 // Recheck after crypto construction too: disable/replacement during that work must
 // stop dispatch. An already accepted vendor request cannot be recalled.
 const transport=async(url,options)=>{
  requireRollout(env,userId,true);
  const current=await db.prepare(`SELECT id FROM push_subscriptions WHERE id=? AND user_id=? AND enabled=1 AND version=? AND ${eligibleAccount}`).bind(id,userId,row.version,...eligibilityArgs(env,userId)).first();
  if(!current)throw new Error('Notification no longer eligible');
  return fetch(url,options);
 };
 const outcome=await deliverPush({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},
 {publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,subject:env.VAPID_SUBJECT},
 {version:1,title:'Miszuk Family',body:'Test notification',destination:'home',id:crypto.randomUUID()},transport);
 if(outcome.result==='expired')await db.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=? AND version=?').bind(id,userId,row.version).run();
 else await db.prepare(`UPDATE push_subscriptions SET last_result=?,failure_count=CASE WHEN ?='accepted' THEN 0 ELSE min(failure_count+1,1000) END,
 last_success_at=CASE WHEN ?='accepted' THEN CURRENT_TIMESTAMP ELSE last_success_at END WHERE id=? AND user_id=? AND version=?`)
 .bind(outcome.result,outcome.result,outcome.result,id,userId,row.version).run();
 return {result:outcome.result};
}
