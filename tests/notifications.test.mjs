import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';
import {syntheticPush} from './push-fixture.mjs';
import {sendTest} from '../src/api/notifications/sender.js';
import {validateEndpoint,subscriptionInput} from '../src/api/notifications/policy.js';
const base='/api/notifications/';
async function setup(t){const f=fixture(t),keys=await syntheticPush();const env={DB:f.DB,ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',NOTIFICATIONS_ALLOWED_USER_IDS:'local-account',NOTIFICATIONS_ENROLLMENT_ENABLED:'true',NOTIFICATIONS_SENDING_ENABLED:'true',VAPID_PUBLIC_KEY:keys.vapid.publicKey,VAPID_PRIVATE_KEY:keys.vapid.privateKey,VAPID_KEY_ID:'synthetic',VAPID_SUBJECT:'mailto:bob@miszuk.com'};return {...f,keys,env,call:(p,m='GET',b)=>f.request(base+p,m,b,{env})};}
test('notification rollout defaults closed; own status is sanitized and categories default off',async t=>{
 const {request,db}=fixture(t);
 assert.deepEqual((await request(base+'config')).data,{enrollment_allowed:false,sending_allowed:false,public_key:null,key_id:null});
 for(const route of ['subscriptions','test'])assert.equal((await request(base+route,'POST',{})).status,403);
 assert.deepEqual((await request(base+'subscriptions')).data,{items:[]});
 assert.ok(Object.values((await request(base+'preferences')).data.categories).every(v=>v===false));
 assert.equal(db.prepare('SELECT count(*) n FROM notification_preferences').get().n,0);
});
test('Member and Administrator own-device registration is idempotent, bounded, and never transferable',async t=>{
 const {call,db,keys,env}=await setup(t);const body={subscription:keys.subscription};
 const first=await call('subscriptions','POST',body);assert.equal(first.status,200);
 assert.equal((await call('subscriptions','POST',body)).data.item.id,first.data.item.id);
 db.exec("UPDATE app_users SET role='administrator'");
 assert.equal((await call('subscriptions','POST',body)).data.item.id,first.data.item.id);
 const listing=JSON.stringify((await call('subscriptions')).data);
 for(const secret of ['endpoint','p256dh','auth','local-account',keys.subscription.endpoint,keys.subscription.keys.auth])assert.ok(!listing.includes(secret));
 assert.equal((await call('subscriptions','POST',{...body,user_id:'other'})).status,400);
 db.exec("INSERT INTO people(id,family_id,first_name) SELECT 'other',id,'Other' FROM families LIMIT 1; INSERT INTO app_users(id,person_id,status,role) VALUES('other','other','active','member')");
 db.exec("UPDATE push_subscriptions SET user_id='other'");
 assert.equal((await call('subscriptions','POST',body)).status,409);
 assert.deepEqual((await call('subscriptions')).data.items,[]);
 await call('subscriptions/'+first.data.item.id,'DELETE');
 assert.equal(db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,1);
 await assert.rejects(sendTest(env,'local-account',first.data.item.id),e=>e.status===404);
 db.exec('DELETE FROM push_subscriptions');
 for(let i=0;i<10;i++)assert.equal((await call('subscriptions','POST',{subscription:{...keys.subscription,endpoint:keys.subscription.endpoint+i}})).status,200);
 assert.equal((await call('subscriptions','POST',body)).status,409);
});
test('subscription validation rejects arbitrary destinations, malformed keys and expired subscriptions',async()=>{
 const keys=await syntheticPush();
 for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://example.test/x','https://fcm.googleapis.com.evil.test/x','https://u:p@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com/x#y'])assert.throws(()=>validateEndpoint(endpoint));
 for(const subscription of [{...keys.subscription,expirationTime:1},{...keys.subscription,keys:{...keys.subscription.keys,p256dh:'x'.repeat(87)}},{...keys.subscription,keys:{...keys.subscription.keys,auth:'bad'}}])await assert.rejects(subscriptionInput({subscription}));
 assert.equal((await subscriptionInput({subscription:keys.subscription})).endpoint,keys.subscription.endpoint);
});
test('preferences use own account, allowlisted categories and optimistic versions',async t=>{
 const {call}=await setup(t);
 assert.equal((await call('preferences','PATCH',{version:0,categories:{chat:true}})).status,200);
 assert.equal((await call('preferences','PATCH',{version:0,categories:{chat:false}})).status,409);
 assert.equal((await call('preferences','PATCH',{version:1,categories:{unknown:true}})).status,400);
 assert.equal((await call('preferences','PATCH',{version:1,categories:{chat:false},user_id:'other'})).status,400);
 assert.equal((await call('preferences','PATCH',{version:1,categories:{chat:false}})).status,200);
 assert.equal((await call('preferences')).data.version,2);
});
test('identity replacement invalidates devices atomically and disabling denies the next API request',async t=>{
 const {call,db,keys,env}=await setup(t);
 const id=(await call('subscriptions','POST',{subscription:keys.subscription})).data.item.id;
 db.exec("BEGIN; UPDATE user_identities SET login_email='replacement@example.test',subject=NULL,bound_at=NULL; ROLLBACK;");
 assert.equal(db.prepare('SELECT enabled FROM push_subscriptions').get().enabled,1);
 db.exec("UPDATE user_identities SET login_email='replacement@example.test',subject=NULL,bound_at=NULL");
 assert.equal(db.prepare('SELECT enabled FROM push_subscriptions').get().enabled,0);
 await assert.rejects(sendTest(env,'local-account',id),e=>e.status===404);
 db.exec("UPDATE user_identities SET login_email='family@localhost',subject='local-development',bound_at=CURRENT_TIMESTAMP; UPDATE app_users SET status='disabled'");
 assert.equal((await call('subscriptions')).status,403);
 assert.equal((await call('preferences')).status,403);
 await assert.rejects(sendTest(env,'local-account',id),e=>e.status===404);
});
test('sender uses only mock provider, short TTL, manual redirects, terminal cleanup and bounded failures',async t=>{
 const {call,db,keys,env}=await setup(t);const original=globalThis.fetch;let status=201,calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,keys.subscription.endpoint);assert.equal(options.redirect,'manual');assert.equal(String(new Headers(options.headers).get('TTL')),'300');if(status===0)throw new Error('synthetic network failure');return new Response(null,{status});};t.after(()=>{globalThis.fetch=original;});
 for(const [code,result] of [[201,'accepted'],[401,'configuration'],[403,'configuration'],[429,'temporary'],[503,'temporary'],[302,'rejected'],[0,'temporary'],[404,'expired'],[410,'expired']]){
  status=code;db.exec('DELETE FROM notification_preferences');const id=(await call('subscriptions','POST',{subscription:keys.subscription})).data.item.id;
  assert.deepEqual(await sendTest(env,'local-account',id),{result});
  assert.equal(db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,result==='expired'?0:1);
 }
 assert.equal(calls,9);
 const id=(await call('subscriptions','POST',{subscription:keys.subscription})).data.item.id;
 await assert.rejects(sendTest(env,'local-account',id),e=>e.status===429);
 env.NOTIFICATIONS_SENDING_ENABLED='false';await assert.rejects(sendTest(env,'local-account',id),e=>e.status===403);assert.equal(calls,9);
});
test('notification schema enforces ownership, unique endpoint, bounded metadata and restrictive deletion',async t=>{
 const {call,db,keys}=await setup(t);await call('subscriptions','POST',{subscription:keys.subscription});
 assert.throws(()=>db.exec("UPDATE push_subscriptions SET user_id='missing'"));
 assert.throws(()=>db.exec('UPDATE push_subscriptions SET failure_count=1001'));
 assert.throws(()=>db.exec("DELETE FROM app_users WHERE id='local-account'"));
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('optional pilot restriction remains exact account ID, never Administrator role, and both kill switches work',async t=>{
 const {call,db,env}=await setup(t);
 for(const role of ['member','administrator']){
  db.prepare('UPDATE app_users SET role=?').run(role);
  env.NOTIFICATIONS_ALLOWED_USER_IDS='someone-else';
  const blocked=await call('config');assert.equal(blocked.data.enrollment_allowed,false);assert.equal(blocked.data.sending_allowed,false);assert.equal(blocked.data.public_key,null);
  for(const route of ['subscriptions','test'])assert.equal((await call(route,'POST',{})).status,403);
  env.NOTIFICATIONS_ALLOWED_USER_IDS='local-account';
  assert.equal((await call('config')).data.enrollment_allowed,true);assert.equal((await call('config')).data.sending_allowed,true);
 }
 env.NOTIFICATIONS_SENDING_ENABLED='false';assert.equal((await call('test','POST',{})).status,403);assert.equal((await call('config')).data.enrollment_allowed,true);
 env.NOTIFICATIONS_ENROLLMENT_ENABLED='false';assert.equal((await call('subscriptions','POST',{})).status,403);
});

test('family enrollment includes future active accounts without household or allowlist membership',async t=>{
 const {call,db,env,keys}=await setup(t);
 env.NOTIFICATIONS_AUDIENCE='active_accounts';env.NOTIFICATIONS_ALLOWED_USER_IDS='';
 db.exec("INSERT INTO people(id,family_id,first_name) SELECT 'future-person',id,'Future' FROM families LIMIT 1; INSERT INTO app_users(id,person_id,status,role) VALUES('future-account','future-person','active','member'); UPDATE user_identities SET user_id='future-account'");
 for(const role of ['member','administrator']){
  db.prepare("UPDATE app_users SET role=? WHERE id='future-account'").run(role);
  const config=(await call('config')).data;
  assert.equal(config.enrollment_allowed,true);assert.equal(config.sending_allowed,true);
 }
 const registered=await call('subscriptions','POST',{subscription:keys.subscription});assert.equal(registered.status,200);
 assert.equal(db.prepare('SELECT user_id FROM push_subscriptions').get().user_id,'future-account');
 for(const status of ['disabled','pending']){
  db.prepare("UPDATE app_users SET status=? WHERE id='future-account'").run(status);
  assert.equal((await call('config')).status,403);
  assert.equal((await call('subscriptions','POST',{subscription:keys.subscription})).status,403);
  await assert.rejects(sendTest(env,'future-account',registered.data.item.id),e=>e.status===404);
 }
 db.exec("UPDATE app_users SET status='active' WHERE id='future-account'; UPDATE people SET deleted_at=CURRENT_TIMESTAMP WHERE id='future-person'");
 assert.equal((await call('config')).status,403);
 await assert.rejects(sendTest(env,'future-account',registered.data.item.id),e=>e.status===404);
 db.exec("UPDATE people SET deleted_at=NULL; DELETE FROM user_identities");
 assert.equal((await call('config')).status,403);
 await assert.rejects(sendTest(env,'future-account',registered.data.item.id),e=>e.status===404);
});
