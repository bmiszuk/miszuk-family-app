import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCoziFeed} from '../src/api/coziFeed.js';
import {createCoziHandler} from '../src/api/cozi.js';
import {upcomingCoziEvents,coziAgenda,coziDateLabel} from '../src/coziCalendar.js';
const sample=readFileSync(new URL('./fixtures/cozi-sample.ics',import.meta.url),'utf8');
const now=new Date('2026-09-09T17:00:00Z');
const wrap=events=>'BEGIN:VCALENDAR\nVERSION:2.0\n'+events+'\nEND:VCALENDAR';
const event=lines=>'BEGIN:VEVENT\n'+lines+'\nEND:VEVENT';

test('Cozi timed/all-day events, recurrence, EXDATE, moved and cancelled exceptions',async()=>{
 const items=await parseCoziFeed(sample,{now});
 assert.equal(items.length,4);
 assert.equal(items[0].start_at,'2026-09-09T22:00:00.000Z');
 assert.equal(items[0].end_at,'2026-09-09T23:00:00.000Z');
 assert.deepEqual(items[0].participants,['Alex']);
 assert.deepEqual(items[0].categories,['Sports']);
 assert.equal(items[0].location,'Community field');
 assert.equal(items[1].start_at,'2026-09-09T23:30:00.000Z');
 assert.equal(items[2].all_day,true);assert.equal(items[2].start_at,'2026-09-12');assert.equal(items[2].end_at,'2026-09-14');
 assert.equal(items[3].title,'Rescheduled practice');assert.equal(items[3].start_at,'2026-09-24T23:30:00.000Z');
 assert.equal(items.some(e=>e.start_at.startsWith('2026-09-16')||e.start_at.startsWith('2026-09-30')),false);
});
test('Chicago recurring wall times follow daylight saving changes, including floating times',async()=>{
 for(const suffix of [';TZID=America/Chicago','']){
  const items=await parseCoziFeed(wrap(event(`UID:dst\nDTSTART${suffix}:20260307T090000\nDTEND${suffix}:20260307T100000\nRRULE:FREQ=DAILY;COUNT=3\nSUMMARY:Morning`)),{now:new Date('2026-03-07T06:00:00Z')});
  assert.deepEqual(items.map(e=>e.start_at),['2026-03-07T15:00:00.000Z','2026-03-08T14:00:00.000Z','2026-03-09T14:00:00.000Z']);
 }
});
test('RDATE, missing all-day end, cancelled series and detached moved exceptions',async()=>{
 const source=wrap(event('UID:dates\nDTSTART;VALUE=DATE:20260909\nRDATE;VALUE=DATE:20260911\nSUMMARY:Dates')+'\n'+event('UID:cancel\nDTSTART:20260909T180000Z\nRRULE:FREQ=DAILY;COUNT=3\nSTATUS:CANCELLED')+'\n'+event('UID:moved\nRECURRENCE-ID:20250101T180000Z\nDTSTART:20260910T180000Z\nSUMMARY:Moved'));
 const items=await parseCoziFeed(source,{now});assert.equal(items.length,3);
 assert.equal(items[0].end_at,'2026-09-10');assert.equal(items[1].title,'Moved');
});
test('Home selection and agenda use Chicago today and exclusive all-day ends',async()=>{
 const items=await parseCoziFeed(sample,{now});
 assert.deepEqual(upcomingCoziEvents([...items].reverse(),now,2).map(e=>e.title),['Soccer practice','Family dinner']);
 const groups=coziAgenda(items,now);assert.deepEqual(groups.map(g=>g.items.length),[2,1,1]);
 assert.match(coziDateLabel(items[2]),/Sep 12.*Sep 13.*All day/);
 assert.equal(upcomingCoziEvents([items[2]],new Date('2026-09-14T04:59:00Z')).length,1);
 assert.equal(upcomingCoziEvents([items[2]],new Date('2026-09-14T05:00:00Z')).length,0);
 const boundary=await parseCoziFeed(wrap(event('UID:newyear\nDTSTART;VALUE=DATE:20270101\nSUMMARY:New year')),{now:new Date('2026-12-31T20:00:00Z')});
 assert.equal(coziAgenda(boundary,new Date('2027-01-01T01:00:00Z'))[1].items.length,1);
});
test('unknown timezone or malformed feeds fail safely rather than showing incorrect dates',async()=>{
 await assert.rejects(parseCoziFeed('<html>Oops</html>',{now}));
 await assert.rejects(parseCoziFeed(wrap(event('UID:bad\nDTSTART;TZID=Unknown/Zone:20260909T090000')),{now}));
});
test('Cozi endpoint caches success, coalesces calls, expires, and never exposes feed secrets',async()=>{
 const secret='https://rest.cozi.com/private/secret-test-only';let calls=0,time=now;
 const handler=createCoziHandler({clock:()=>time,fetcher:async(url,options)=>{calls++;assert.equal(url,secret);assert.equal(options.redirect,'manual');return new Response(sample.replace('Family dinner','Family dinner '+secret));}});
 const request=new Request('https://family.miszuk.com/api/cozi-calendar');const env={COZI_CALENDAR_URL:secret};
 const responses=await Promise.all([handler(request,env),handler(request,env)]);
 assert.equal(calls,1);for(const r of responses){assert.equal(r.status,200);const body=await r.text();assert.ok(!body.includes(secret));assert.ok(!body.includes('BEGIN:VCALENDAR'));assert.ok(!body.includes('mailto:'));assert.equal(r.headers.get('Cache-Control'),'private, no-store');}
 await handler(request,env);assert.equal(calls,1);
 time=new Date(now.getTime()+301000);await handler(request,env);assert.equal(calls,2);
});
test('missing feed, network/parse failure and invalid configuration return concise safe errors',async()=>{
 const secret='https://rest.cozi.com/private/secret-test-only';const request=new Request('https://family.miszuk.com/api/cozi-calendar');
 let calls=0;
 const handler=createCoziHandler({clock:()=>now,fetcher:async()=>{calls++;throw new Error(secret);}});
 assert.equal((await handler(request,{})).status,503);assert.equal(calls,0);
 const failed=await handler(request,{COZI_CALENDAR_URL:secret});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes(secret));
 await handler(request,{COZI_CALENDAR_URL:secret});assert.equal(calls,1);
 for(const source of ['bad feed','<html>Login</html>']){const parseFailure=createCoziHandler({fetcher:async()=>new Response(source)});assert.equal((await parseFailure(request,{COZI_CALENDAR_URL:secret})).status,503);}
 for(const url of ['http://rest.cozi.com/feed','https://example.com/feed','https://user:pass@rest.cozi.com/feed'])assert.equal((await handler(request,{COZI_CALENDAR_URL:url})).status,503);
 assert.equal(calls,1);
 assert.equal((await handler(new Request(request.url,{method:'POST'}),{COZI_CALENDAR_URL:secret})).status,405);
});

test('shared cache is reusable across Worker instances and secret rotation isolates it',async()=>{
 const storage=new Map();const cache={match:async key=>storage.get(key)?.clone(),put:async(key,value)=>storage.set(key,value)};
 let calls=0;const options={clock:()=>now,cache,fetcher:async()=>{calls++;return new Response(sample);}};
 const request=new Request('https://family.miszuk.com/api/cozi-calendar'),env={COZI_CALENDAR_URL:'https://rest.cozi.com/one'};
 assert.equal((await createCoziHandler(options)(request,env)).status,200);
 assert.equal((await createCoziHandler(options)(request,env)).status,200);assert.equal(calls,1);
 assert.ok([...storage.keys()].every(key=>!key.includes(env.COZI_CALENDAR_URL)));
 await createCoziHandler(options)(request,{COZI_CALENDAR_URL:'https://rest.cozi.com/two'});assert.equal(calls,2);
});
test('feed redirects, oversized feeds and excessive recurrence fail without exposing content',async()=>{
 const request=new Request('https://family.miszuk.com/api/cozi-calendar'),env={COZI_CALENDAR_URL:'https://rest.cozi.com/private'};
 for(const response of [new Response(null,{status:302,headers:{Location:'https://example.com/private'}}),new Response('too large',{headers:{'Content-Length':String(3*1024*1024)}})]){
  const handler=createCoziHandler({clock:()=>now,fetcher:async()=>response});assert.equal((await handler(request,env)).status,503);
 }
 await assert.rejects(parseCoziFeed(wrap(event('UID:limit\nDTSTART:20260909T000000Z\nRRULE:FREQ=SECONDLY;COUNT=30000')),{now}));
});
test('embedded VTIMEZONE rules and UTC UNTIL constrain recurrence accurately',async()=>{
 const zone='BEGIN:VTIMEZONE\nTZID:Test/Fixed\nBEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:-0600\nTZOFFSETTO:-0600\nEND:STANDARD\nEND:VTIMEZONE';
 const items=await parseCoziFeed(wrap(zone+'\n'+event('UID:embedded\nDTSTART;TZID=Test/Fixed:20260909T090000\nDTEND;TZID=Test/Fixed:20260909T100000\nRRULE:FREQ=DAILY;UNTIL=20260910T150000Z')),{now});
 assert.equal(items.length,2);assert.equal(items[1].start_at,'2026-09-10T15:00:00.000Z');
});
