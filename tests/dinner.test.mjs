import test from 'node:test';
import assert from 'node:assert/strict';
import {weekStart,weekDays,addDays,validDay} from '../src/dinnerDates.js';
import {activeNotices} from '../src/familyDisplay.js';
test('dinner weeks cross year boundary without recurring assignments',()=>{
 assert.equal(weekStart('2027-01-01'),'2026-12-28');
 assert.equal(weekDays('2026-12-28')[6],'2027-01-03');
 assert.equal(addDays('2026-12-28',7),'2027-01-04');
 assert.equal(validDay('2026-02-30'),false);
});
test('Home chooses newest pinned notice and falls back after unpin',()=>{
 const posts=[{id:'a',created_at:'2026-01-01',home_notice:true},{id:'b',created_at:'2026-02-01',home_notice:true},{id:'c',created_at:'2026-03-01',home_notice:false}];
 assert.equal(activeNotices(posts).slice(-1)[0].id,'b');posts[1].home_notice=false;
 assert.equal(activeNotices(posts).slice(-1)[0].id,'a');assert.equal(posts.length,3);
});
