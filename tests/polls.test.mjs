import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './permission-fixture.mjs';import {defaultHousehold,localPerson} from './account-fixture.mjs';
import {handlePolls} from '../src/api/polls/handler.js';import {notifyPoll} from '../src/api/notifications/events.js';
import {syntheticPush,inspectPush} from './push-fixture.mjs';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
const body=()=>({id:crypto.randomUUID(),question:'Saturday dinner?',options:['Yes','No','Maybe']});
function setup(t){const f=fixture(t);const batch=f.DB.batch.bind(f.DB);let queue=Promise.resolve();f.DB.batch=statements=>{const result=queue.then(()=>batch(statements));queue=result.catch(()=>{});return result;};function add(id,household=defaultHousehold,status='active'){
 f.db.prepare('INSERT INTO people(id,family_id,first_name,household_id) VALUES(?,?,?,?)').run('p-'+id,'existing',id,household);
 f.db.prepare('INSERT INTO app_users(id,person_id,status,role) VALUES(?,?,?,?)').run(id,'p-'+id,status,'member');
 f.db.prepare('INSERT INTO user_identities(id,user_id,provider,issuer,login_email,subject,bound_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)').run('i-'+id,id,'cloudflare_access','https://test.cloudflareaccess.com',id+'@example.test',id);
 }
 add('other');add('disabled',defaultHousehold,'disabled');add('pending',defaultHousehold,'pending');
 f.db.exec("INSERT INTO households(id,name) VALUES('elsewhere','Elsewhere')");add('outsider','elsewhere');
 async function as(user,path,method='GET',value,ctx,env={}){const person=f.db.prepare('SELECT p.* FROM people p JOIN app_users u ON p.id=u.person_id WHERE u.id=?').get(user);try{const r=await handlePolls(new Request('http://localhost/api/polls'+path,{method,...(value?{headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:{})}),{DB:f.DB,ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',...env},{account:{id:user,role:'administrator'},person,household:person.household_id?{id:person.household_id}:null},ctx);return{status:r.status,data:await r.json()};}catch(e){if(!e.status)throw e;return{status:e.status};}}
 return {...f,add,as,create:b=>f.request('/api/polls','POST',b||body())};}
test('poll creation snapshots only active household accounts including creator; retry is idempotent; no configurable extras',async t=>{
 const f=setup(t),b=body(),r=await f.create(b);assert.equal(r.status,201,JSON.stringify(r));
 assert.deepEqual(f.db.prepare('SELECT user_id FROM poll_recipients ORDER BY user_id').all().map(r=>r.user_id),['local-account','other']);
 assert.equal(Date.parse(r.data.item.expires_at)-Date.parse(r.data.item.created_at),7*86400000);
 f.add('later');assert.equal((await f.create(b)).status,200);assert.equal(f.db.prepare('SELECT count(*) n FROM poll_recipients').get().n,2);
 assert.equal((await f.create({...b,question:'Different'})).status,409);
 for(const extra of ['recipients','household_id','expires_at','creator_user_id','anonymous','notify'])assert.equal((await f.create({...body(),[extra]:'bad'})).status,400,extra);
 for(const options of [['Yes'],[' yes ','YES'],Array(9).fill('x'),['','No']])assert.equal((await f.create({...body(),options})).status,400);
});
test('recipient results are shared; one answer can change; stale/foreign/extra values rejected',async t=>{
 const f=setup(t),r=await f.create(),id=r.data.item.id,d=await f.request('/api/polls/'+id),[yes,no]=d.data.item.options;
 assert.equal((await f.as('other','/'+id+'/response','PUT',{option_id:yes.id,version:0})).status,200);
 assert.equal((await f.as('other','/'+id+'/response','PUT',{option_id:no.id,version:0})).status,409);
 assert.equal((await f.as('other','/'+id+'/response','PUT',{option_id:no.id,version:1})).status,200);
 const results=await f.request('/api/polls/'+id+'/results');assert.equal(results.data.item.responses.find(r=>r.first_name==='other').option_id,no.id);
 assert.equal((await f.as('other','/'+id+'/response','PUT',{option_id:crypto.randomUUID(),version:2})).status,409);
 assert.equal((await f.as('other','/'+id+'/response','PUT',{option_id:yes.id,version:2,user_id:'local-account'})).status,400);
 assert.equal((await f.as('other','/'+id+'/close','POST',{version:1})).status,403);
 assert.equal((await f.request('/api/polls/'+id,'PATCH',{question:'changed'})).status,405);
});
test('household and snapshot boundaries protect detail/results/history/counts; no Admin or creator bypass after moving',async t=>{
 const f=setup(t),id=(await f.create()).data.item.id;f.add('later');
 for(const user of ['outsider','later','disabled','pending']){
  for(const tail of ['','/results'])assert.equal((await f.as(user,'/'+id+tail)).status,404,user);
  assert.equal((await f.as(user,'')).data.items.length,0);assert.equal((await f.as(user,'/summary')).data.active_count,0);
 }
 f.db.prepare('UPDATE people SET household_id=? WHERE id=?').run('elsewhere',localPerson);
 for(const tail of ['','/results'])assert.equal((await f.request('/api/polls/'+id+tail)).status,404);
 assert.equal((await f.request('/api/polls/'+id+'/close','POST',{version:1})).status,404);
 f.db.prepare('UPDATE people SET household_id=NULL WHERE id=?').run(localPerson);assert.equal((await f.request('/api/polls')).status,403);
});
test('close freezes results and history; expiration ignores question text; bounded summary prioritizes unanswered',async t=>{
 const f=setup(t),a=(await f.create({...body(),question:'Tomorrow yesterday 1/1/1990'})).data.item,b=(await f.create()).data.item;
 const opts=(await f.request('/api/polls/'+a.id)).data.item.options;
 await f.request('/api/polls/'+a.id+'/response','PUT',{option_id:opts[0].id,version:0});
 let summary=(await f.request('/api/polls/summary')).data;assert.equal(summary.active_count,2);assert.equal(summary.unanswered_count,1);assert.equal(summary.next.id,b.id);
 assert.equal((await f.request('/api/polls/'+a.id+'/close','POST',{version:2})).status,409);
 assert.equal((await f.request('/api/polls/'+a.id+'/close','POST',{version:1})).status,200);
 assert.equal((await f.request('/api/polls/'+a.id+'/response','PUT',{option_id:opts[1].id,version:1})).status,409);
 assert.equal((await f.request('/api/polls?view=history')).data.items[0].id,a.id);
 f.db.prepare("UPDATE polls SET created_at='2026-01-01T00:00:00.000Z',expires_at='2026-01-08T00:00:00.000Z' WHERE id=?").run(b.id);
 assert.equal((await f.request('/api/polls/summary')).data.active_count,0);assert.equal((await f.request('/api/polls?offset=-1')).status,400);
});
test('transaction rolls back publication on partial failure and rechecks creator account state',async t=>{
 const f=setup(t);f.db.exec("CREATE TRIGGER reject_recipient BEFORE INSERT ON poll_recipients BEGIN SELECT RAISE(ABORT,'synthetic'); END");assert.equal((await f.create()).status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM polls').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM poll_options').get().n,0);
 f.db.exec('DROP TRIGGER reject_recipient');f.db.exec("UPDATE app_users SET status='disabled' WHERE id='local-account'");assert.equal((await f.as('local-account','','POST',body())).status,409);assert.equal((await f.request('/api/polls')).status,403);
});
test('concurrent publish/votes are conflict-safe; closed or retired household cannot mutate',async t=>{
 const f=setup(t),b=body();const created=await Promise.all([f.create(b),f.create(b)]);assert.ok(created.every(r=>[200,201].includes(r.status)));assert.equal(f.db.prepare('SELECT count(*) n FROM polls').get().n,1);
 const id=b.id,opts=(await f.request('/api/polls/'+id)).data.item.options;
 const votes=await Promise.all(opts.slice(0,2).map(o=>f.request('/api/polls/'+id+'/response','PUT',{option_id:o.id,version:0})));assert.deepEqual(votes.map(r=>r.status).sort(),[200,409]);
 await f.request('/api/polls/'+id+'/close','POST',{version:1});assert.equal((await f.as('other','/'+id+'/response','PUT',{option_id:opts[0].id,version:0})).status,409);
 // Use an otherwise valid household retirement marker to verify request-time state.
 f.db.exec("DROP TRIGGER IF EXISTS household_delete_members");
 f.db.prepare("UPDATE households SET deleted_at='retired' WHERE id=?").run(defaultHousehold);
 assert.equal((await f.as('other','/'+id)).status,404);
});
test('poll schema migration preserves preexisting category claims and preference opt-outs',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE app_users(id TEXT PRIMARY KEY); CREATE TABLE households(id TEXT PRIMARY KEY)');db.exec("INSERT INTO app_users VALUES('u')");db.exec(readFileSync(new URL('../migrations/0010_notification_deliveries.sql',import.meta.url),'utf8'));db.exec("INSERT INTO notification_deliveries(event_key,user_id,category,accepted_count) VALUES('birthday-p:2026-09-30','u','birthdays',1),('chat:p','u','chat',0)");const before=db.prepare('SELECT * FROM notification_deliveries ORDER BY rowid').all();db.exec(readFileSync(new URL('../migrations/0011_household_polls.sql',import.meta.url),'utf8'));assert.deepEqual(db.prepare('SELECT * FROM notification_deliveries ORDER BY rowid').all(),before);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('new poll push targets household recipients only, defaults on, generic encrypted payload, and deduplicates',async t=>{
 const f=setup(t),keys=await syntheticPush();keys.vapid.subject='mailto:bob@miszuk.com';const env={DB:f.DB,ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',NOTIFICATIONS_AUDIENCE:'active_accounts',NOTIFICATIONS_ENROLLMENT_ENABLED:'true',NOTIFICATIONS_SENDING_ENABLED:'true',VAPID_PUBLIC_KEY:keys.vapid.publicKey,VAPID_PRIVATE_KEY:keys.vapid.privateKey,VAPID_KEY_ID:'synthetic',VAPID_SUBJECT:keys.vapid.subject};
 for(const user of ['local-account','other','outsider','disabled'])f.db.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,vapid_key_id) VALUES(?,?,?,?,?,?)').run(user,user,keys.subscription.endpoint+'/'+user,keys.subscription.keys.p256dh,keys.subscription.keys.auth,'synthetic');
 const calls=[],oldFetch=globalThis.fetch;let expected,inspectionError;globalThis.fetch=async(url,options)=>{calls.push(url);try{await inspectPush(new Request(url,options),keys,expected);}catch(e){inspectionError=e;}return new Response(null,{status:201});};t.after(()=>{globalThis.fetch=oldFetch;});
 const b=body(),pending=[];expected={version:1,title:'Family Poll',body:'New poll — vote now',destination:'home',id:'poll-published:'+b.id};const r=await f.request('/api/polls','POST',b,{env,ctx:{waitUntil:p=>pending.push(p)}});assert.equal(r.status,201);await Promise.all(pending);if(inspectionError)throw inspectionError;assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/other'));await notifyPoll(env,b.id);assert.equal(calls.length,1);
 f.db.prepare('INSERT INTO notification_preferences(user_id,categories) VALUES(?,?)').run('other',JSON.stringify({polls:false}));const second=(await f.create()).data.item.id;await notifyPoll(env,second);assert.equal(calls.length,1);
 f.db.prepare("UPDATE notification_preferences SET categories='{}' WHERE user_id='other'").run();f.db.prepare("UPDATE people SET household_id='elsewhere' WHERE id='p-other'").run();await notifyPoll(env,second);assert.equal(calls.length,1);
 f.db.prepare('UPDATE people SET household_id=? WHERE id=?').run(defaultHousehold,'p-other');f.db.exec("CREATE TRIGGER fail_claim BEFORE INSERT ON notification_deliveries BEGIN SELECT RAISE(ABORT,'synthetic'); END");const pending2=[];assert.equal((await f.request('/api/polls','POST',body(),{env,ctx:{waitUntil:p=>pending2.push(p)}})).status,201);await Promise.all(pending2);assert.equal(calls.length,1);
});

test('publication and voting recheck authority at the write, not only at request start',async t=>{
 const f=setup(t),originalBatch=f.DB.batch;
 f.DB.batch=async statements=>{f.db.prepare("UPDATE people SET household_id='elsewhere' WHERE id=?").run(localPerson);return originalBatch(statements);};
 assert.equal((await f.create()).status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM polls').get().n,0);
 f.DB.batch=originalBatch;f.db.prepare('UPDATE people SET household_id=? WHERE id=?').run(defaultHousehold,localPerson);
 const id=(await f.create()).data.item.id,option=(await f.request('/api/polls/'+id)).data.item.options[0].id;
 const prepare=f.DB.prepare.bind(f.DB);
 f.DB.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('INSERT INTO poll_responses')){const run=s.run;s.run=async()=>{f.db.prepare('UPDATE polls SET closed_at=CURRENT_TIMESTAMP WHERE id=?').run(id);return run();};}return s;};
 assert.equal((await f.request('/api/polls/'+id+'/response','PUT',{option_id:option,version:0})).status,409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM poll_responses').get().n,0);
});

test('poll dispatch rechecks household after claiming and suppresses an already answered recipient',async t=>{
 const f=setup(t),keys=await syntheticPush();const env={DB:f.DB,ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',NOTIFICATIONS_AUDIENCE:'active_accounts',NOTIFICATIONS_ENROLLMENT_ENABLED:'true',NOTIFICATIONS_SENDING_ENABLED:'true',VAPID_PUBLIC_KEY:keys.vapid.publicKey,VAPID_PRIVATE_KEY:keys.vapid.privateKey,VAPID_KEY_ID:'synthetic',VAPID_SUBJECT:'mailto:bob@miszuk.com'};
 f.db.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,vapid_key_id) VALUES(?,?,?,?,?,?)').run('device','other',keys.subscription.endpoint,keys.subscription.keys.p256dh,keys.subscription.keys.auth,'synthetic');
 let sends=0;const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{sends++;return new Response(null,{status:201});};t.after(()=>{globalThis.fetch=oldFetch;});
 const id=(await f.create()).data.item.id;
 f.db.exec("CREATE TRIGGER move_after_claim AFTER INSERT ON notification_deliveries BEGIN UPDATE people SET household_id='elsewhere' WHERE id='p-other'; END");
 await notifyPoll(env,id);assert.equal(sends,0);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_deliveries').get().n,1);
 f.db.exec('DROP TRIGGER move_after_claim');f.db.prepare('UPDATE people SET household_id=? WHERE id=?').run(defaultHousehold,'p-other');
 const second=(await f.create()).data.item.id,option=(await f.as('other','/'+second)).data.item.options[0].id;
 await f.as('other','/'+second+'/response','PUT',{option_id:option,version:0});await notifyPoll(env,second);assert.equal(sends,0);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_deliveries').get().n,1);
});
