import {pollSendEligible} from '../polls/policy.js';
import {rollout,eligibleAccount,eligibilityArgs} from './policy.js';
import {preferenceCondition} from './preferences.js';
import {sendDevice} from './sender.js';
import {celebrations,chicagoDate} from '../../domain/directoryDates.js';

const firstName=name=>String(name||'Family member').trim().split(/\s+/)[0].slice(0,80);
export const birthdayPayload=name=>({version:1,title:'Birthday today',body:`It’s ${firstName(name)}’s birthday today.`,destination:'home'});
export const chatPayload=name=>({version:1,title:'Family Chat',body:`${firstName(name)} posted a new message.`,destination:'chat'});
export function birthdayRunTime(time) {
 const date=new Date(time);
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',hourCycle:'h23'}).format(date)==='08';
}

// At-most-once per event/account: no retries after ambiguous provider acceptance.
// Each claimed account gets one attempt on each device in its current snapshot.
export async function deliverEvent(env,eventKey,category,payload,excludeUserId=null,pollId=null) {
 const db=env.DB,pref=preferenceCondition(category);
 const users=(await db.prepare(`SELECT DISTINCT user_id FROM push_subscriptions WHERE enabled=1 AND vapid_key_id=?
  AND (expiration_time IS NULL OR expiration_time>?) AND user_id<>?`).bind(env.VAPID_KEY_ID,Date.now(),excludeUserId||'').all()).results;
 let index=0;
 const summary={claimed:0,accepted:0,failed:0};
 await Promise.all(Array.from({length:Math.min(4,users.length)},async()=>{
  while(index<users.length){
   const userId=users[index++].user_id;
   if(!rollout(env,userId).sending_allowed)continue;
   try {
    const claim=await db.prepare(`INSERT INTO notification_deliveries(event_key,user_id,category)
     SELECT ?,?,? WHERE ${eligibleAccount} AND ${pref}${pollId?` AND ${pollSendEligible}`:''}
     ON CONFLICT(event_key,user_id) DO NOTHING`).bind(eventKey,userId,category,...eligibilityArgs(env,userId),userId,...(pollId?[pollId,userId]:[])).run();
    if(!claim.meta.changes)continue;
    summary.claimed++;
    const devices=(await db.prepare(`SELECT * FROM push_subscriptions WHERE user_id=? AND enabled=1 AND vapid_key_id=?
     AND (expiration_time IS NULL OR expiration_time>?) ORDER BY id LIMIT 10`).bind(userId,env.VAPID_KEY_ID,Date.now()).all()).results;
    let accepted=0,failed=0;
    for(const device of devices){
     try {const result=await sendDevice(env,device,{...payload,id:eventKey},category,pollId);if(result.result==='accepted')accepted++;else failed++;}
     catch {failed++;}
    }
    await db.prepare('UPDATE notification_deliveries SET completed_at=CURRENT_TIMESTAMP,accepted_count=?,failed_count=? WHERE event_key=? AND user_id=?').bind(accepted,failed,eventKey,userId).run();
    summary.accepted+=accepted;summary.failed+=failed;
   }catch {summary.failed++;}
  }
 }));
 console.info('notification-event',category,JSON.stringify(summary));
 return summary;
}

export async function notifyChat(env,postId,authorId) {
 // Read only committed posts; edits, deletes, failed posts and historical posts
 // are never queued by the API hook. No message text enters the push payload.
 const post=await env.DB.prepare(`SELECT p.first_name FROM news_posts n JOIN people p ON p.id=n.sender_person_id
  WHERE n.id=? AND n.deleted_at IS NULL AND p.deleted_at IS NULL`).bind(postId).first();
 if(!post)return;
 return deliverEvent(env,`chat:${postId}`,'chat',chatPayload(post.first_name),authorId);
}

export async function runBirthdays(env,time) {
 if(!birthdayRunTime(time)||env.NOTIFICATIONS_SENDING_ENABLED!=='true')return;
 const now=new Date(time),date=chicagoDate(now);
 const people=(await env.DB.prepare('SELECT id,first_name,birth_date FROM people WHERE deleted_at IS NULL AND birth_date IS NOT NULL').all()).results;
 // Reuse the Home date rules, including optional years and Feb 29 observance.
 for(const birthday of celebrations(people,[],now,0))await deliverEvent(env,`${birthday.id}:${date}`,'birthdays',birthdayPayload(birthday.name));
}

export async function notifyPoll(env,pollId){
 const poll=await env.DB.prepare('SELECT creator_user_id FROM polls WHERE id=?').bind(pollId).first();
 if(poll)return deliverEvent(env,'poll-published:'+pollId,'polls',{version:1,title:'Family Poll',body:'New poll — vote now',destination:'home'},poll.creator_user_id,pollId);
}
