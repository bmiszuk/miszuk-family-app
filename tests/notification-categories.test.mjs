import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import {syntheticPush,inspectPush} from './push-fixture.mjs';
import {localPerson} from './account-fixture.mjs';
import {birthdayRunTime,runBirthdays,notifyChat,birthdayPayload,chatPayload,deliverEvent} from '../src/api/notifications/events.js';
import {effectivePreferences} from '../src/api/notifications/preferences.js';
import {sendDevice} from '../src/api/notifications/sender.js';

async function setup(t){
 const f=fixture(t),keys=await syntheticPush();keys.vapid.subject='mailto:bob@miszuk.com';
 const env={DB:f.DB,ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',NOTIFICATIONS_AUDIENCE:'active_accounts',NOTIFICATIONS_ENROLLMENT_ENABLED:'true',NOTIFICATIONS_SENDING_ENABLED:'true',VAPID_PUBLIC_KEY:keys.vapid.publicKey,VAPID_PRIVATE_KEY:keys.vapid.privateKey,VAPID_KEY_ID:'synthetic',VAPID_SUBJECT:keys.vapid.subject};
 f.db.exec("INSERT INTO people(id,family_id,first_name) SELECT 'recipient-person',id,'Second Member' FROM families LIMIT 1; INSERT INTO app_users(id,person_id,status,role) VALUES('recipient','recipient-person','active','member'); INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES('recipient-identity','recipient','cloudflare_access','https://test.cloudflareaccess.com','recipient@example.test','synthetic-subject',CURRENT_TIMESTAMP)");
 function device(id,userId){f.db.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,vapid_key_id) VALUES(?,?,?,?,?,?)').run(id,userId,keys.subscription.endpoint+'/'+id,keys.subscription.keys.p256dh,keys.subscription.keys.auth,'synthetic');}
 const calls=[];let expected,status=201,inspectionError;
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{calls.push(url);if(expected){try{await inspectPush(new Request(url,options),keys,expected);}catch(error){inspectionError=error;}}return new Response(null,{status});};
 t.after(()=>{globalThis.fetch=oldFetch;});
 const verify=()=>{if(inspectionError)throw inspectionError;};
 return {...f,keys,env,calls,device,verify,expect:value=>{expected=value;},status:value=>{status=value;},call:(path,method,body,ctx)=>f.request(path,method,body,{env,ctx})};
}

test('birthday scheduler uses Chicago 8 AM in summer/winter and across DST/year boundaries',()=>{
 for(const date of ['2026-07-01T13:00:00Z','2026-01-01T14:00:00Z','2026-03-08T13:00:00Z','2026-11-01T14:00:00Z'])assert.equal(birthdayRunTime(date),true,date);
 for(const date of ['2026-07-01T14:00:00Z','2026-01-01T13:00:00Z','2026-03-08T14:00:00Z','2026-11-01T13:00:00Z','2026-12-31T23:00:00Z'])assert.equal(birthdayRunTime(date),false,date);
 assert.deepEqual(birthdayPayload('Bob Middle'),{version:1,title:'Birthday today',body:'It’s Bob’s birthday today.',destination:'home'});
 assert.deepEqual(chatPayload('Bob Middle'),{version:1,title:'Family Chat',body:'Bob posted a new message.',destination:'chat'});
});

test('birthday uses Directory dates, includes self, fans out to devices, and survives duplicate runs/re-enrollment',async t=>{
 const f=await setup(t);f.device('phone','local-account');f.device('tablet','local-account');f.device('other','recipient');
 f.db.prepare('UPDATE people SET first_name=?,birth_date=? WHERE id=?').run('Bob Middle','1967-01-01',localPerson);
 f.expect({...birthdayPayload('Bob'),id:`birthday-${localPerson}:2027-01-01`});
 await runBirthdays(f.env,Date.parse('2026-12-31T14:00:00Z'));assert.equal(f.calls.length,0);
 await Promise.all([runBirthdays(f.env,Date.parse('2027-01-01T14:00:00Z')),runBirthdays(f.env,Date.parse('2027-01-01T14:00:00Z'))]);
 assert.equal(f.calls.length,3);f.verify();assert.equal(f.db.prepare('SELECT count(*) n FROM notification_deliveries').get().n,2);
 f.db.exec("DELETE FROM push_subscriptions WHERE id='phone'");f.device('replacement-phone','local-account');
 await runBirthdays(f.env,Date.parse('2027-01-01T14:00:00Z'));assert.equal(f.calls.length,3);
 assert.equal(f.db.prepare('SELECT birth_date FROM people WHERE id=?').get(localPerson).birth_date,'1967-01-01');
});

test('yearless Feb 29 follows existing Home observance and inactive/missing dates do not notify',async t=>{
 const f=await setup(t);f.device('phone','local-account');f.db.prepare('UPDATE people SET birth_date=? WHERE id=?').run('02-29',localPerson);
 await runBirthdays(f.env,Date.parse('2027-02-28T14:00:00Z'));assert.equal(f.calls.length,1);
 await runBirthdays(f.env,Date.parse('2028-02-28T14:00:00Z'));assert.equal(f.calls.length,1);
 await runBirthdays(f.env,Date.parse('2028-02-29T14:00:00Z'));assert.equal(f.calls.length,2);
 f.db.prepare('UPDATE people SET deleted_at=? WHERE id=?').run('now',localPerson);
 await runBirthdays(f.env,Date.parse('2029-02-28T14:00:00Z'));assert.equal(f.calls.length,2);
});

test('successful new Chat posts notify others only; edits and failed posts do not; payload omits message text',async t=>{
 const f=await setup(t);f.device('author','local-account');f.device('recipient-phone','recipient');
 const pending=[],ctx={waitUntil:p=>pending.push(p)};
 const posted=await f.call('/api/news','POST',{body:'Private chat text'},ctx);assert.equal(posted.status,201);
 f.expect({...chatPayload('Local'),id:`chat:${posted.data.item.id}`});
 await Promise.all(pending);assert.equal(f.calls.length,1);assert.ok(f.calls[0].endsWith('/recipient-phone'));f.verify();
 await Promise.all([notifyChat(f.env,posted.data.item.id,'local-account'),notifyChat(f.env,posted.data.item.id,'local-account')]);assert.equal(f.calls.length,1);
 await f.call('/api/news/'+posted.data.item.id,'PATCH',{body:'Edited private text',version:posted.data.item.version},ctx);assert.equal(pending.length,1);
 assert.equal((await f.call('/api/news','POST',{body:''},ctx)).status,400);assert.equal(pending.length,1);
});

test('Chat saves even when notification ledger or scheduling fails',async t=>{
 const f=await setup(t);f.device('recipient-phone','recipient');
 f.db.exec("CREATE TRIGGER fail_delivery BEFORE INSERT ON notification_deliveries BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 const pending=[];const result=await f.call('/api/news','POST',{body:'Must be saved'},{waitUntil:p=>pending.push(p)});
 await Promise.all(pending);assert.equal(result.status,201);assert.equal(f.calls.length,0);
 assert.equal(f.db.prepare('SELECT body FROM news_posts WHERE id=?').get(result.data.item.id).body,'Must be saved');
 const another=await f.call('/api/news','POST',{body:'Also saved'},{waitUntil(){throw new Error('Unavailable');}});assert.equal(another.status,201);
});

test('category defaults preserve explicit opt-outs; independent toggles and enrollment remain separate',async t=>{
 const f=await setup(t);assert.equal(effectivePreferences({chat:false}).birthdays,true);assert.equal(effectivePreferences({chat:false}).chat,false);
 const initial=(await f.call('/api/notifications/preferences')).data;
 assert.equal(initial.categories.birthdays,true);assert.equal(initial.categories.chat,true);
 await f.call('/api/notifications/preferences','PATCH',{version:0,categories:{chat:false,birthdays:true}});
 f.device('phone','local-account');f.device('recipient-phone','recipient');
 f.db.prepare("INSERT INTO notification_preferences(user_id,categories) VALUES('recipient',?)").run(JSON.stringify({chat:false,birthdays:false}));
 await deliverEvent(f.env,'chat:test','chat',chatPayload('Local'));assert.equal(f.calls.length,0);
 await deliverEvent(f.env,'birthday:test','birthdays',birthdayPayload('Local'));assert.equal(f.calls.length,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,2);
 assert.equal((await f.call('/api/notifications/preferences')).data.categories.chat,false);
});

test('send-time category/account/device/identity checks and kill switch suppress delivery',async t=>{
 const f=await setup(t);f.device('phone','local-account');
 const row=f.db.prepare('SELECT * FROM push_subscriptions').get();
 for(const sql of ["UPDATE app_users SET status='disabled' WHERE id='local-account'","UPDATE people SET deleted_at='now' WHERE id='"+localPerson+"'","UPDATE push_subscriptions SET enabled=0","UPDATE user_identities SET subject='replacement' WHERE user_id='local-account'","INSERT INTO notification_preferences(user_id,categories) VALUES('local-account','{\"chat\":false}')"]){
  f.db.exec('SAVEPOINT state');f.db.exec(sql);await sendDevice(f.env,row,chatPayload('Local'),'chat');assert.equal(f.calls.length,0);f.db.exec('ROLLBACK TO state; RELEASE state');
 }
 f.env.NOTIFICATIONS_SENDING_ENABLED='false';await deliverEvent(f.env,'chat:off','chat',chatPayload('Local'));assert.equal(f.calls.length,0);
});

test('failed provider responses stay deduplicated and one failure does not prevent other recipients',async t=>{
 const f=await setup(t);f.device('one','local-account');f.device('two','recipient');f.status(503);
 const first=await deliverEvent(f.env,'chat:failed','chat',chatPayload('Local'));assert.equal(first.failed,2);
 f.status(201);await deliverEvent(f.env,'chat:failed','chat',chatPayload('Local'));assert.equal(f.calls.length,2);
 assert.equal(f.db.prepare('SELECT sum(failed_count) n FROM notification_deliveries').get().n,2);
});
