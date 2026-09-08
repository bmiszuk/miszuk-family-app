import test from 'node:test';
import assert from 'node:assert/strict';
import {displayNames,chronologicalMessages,activeNotices} from '../src/familyDisplay.js';
import {celebrations} from '../src/directoryDates.js';
test('short date names omit middles and disambiguate first and full names',()=>{
 const people=[{id:'1',first_name:'Russell Thore',last_name:'Schollmeyer',birth_date:'2024-09-12'},{id:'2',first_name:'Jessica L',last_name:'Hatfield'},{id:'3',first_name:'Jessica R',last_name:'Smith'},{id:'4',first_name:'John A',last_name:'Smith'},{id:'5',first_name:'John B',last_name:'Smith'}];
 const names=displayNames(people);
 assert.equal(names.get('1'),'Russell');assert.equal(names.get('2'),'Jessica Hatfield');assert.equal(names.get('3'),'Jessica Smith');assert.equal(names.get('4'),'John A Smith');assert.equal(names.get('5'),'John B Smith');
 const dates=celebrations(people.map(p=>({...p,first_name:names.get(p.id)})),[],new Date('2026-09-07T12:00:00Z'));
 assert.equal(dates[0].name,'Russell');assert.equal(dates[0].when,'Saturday');assert.equal(people[0].first_name,'Russell Thore');
});
test('chat is chronological, only pinned messages reach Home, unpin keeps message',()=>{
 const posts=[{id:'b',created_at:'2026-09-08',home_notice:true},{id:'a',created_at:'2026-09-07',home_notice:false}];
 assert.deepEqual(chronologicalMessages(posts).map(x=>x.id),['a','b']);assert.equal(posts[0].id,'b');
 assert.deepEqual(activeNotices(posts).map(x=>x.id),['b']);posts[0].home_notice=false;assert.equal(activeNotices(posts).length,0);assert.equal(chronologicalMessages(posts).length,2);
});

import {selectedPerson} from '../src/familyDisplay.js';
test('mapped defaults apply on new forms, preserve edits, clearing and alternate selections',()=>{
 for(const field of ['requester_person_id','sender_person_id']){
  assert.equal(selectedPerson(undefined,null,field,'me'),'me');
  assert.equal(selectedPerson(undefined,null,field,null),'');
  assert.equal(selectedPerson('',null,field,'me'),'');
  assert.equal(selectedPerson('other',null,field,'me'),'other');
  assert.equal(selectedPerson(undefined,{[field]:null},field,'me'),'');
  assert.equal(selectedPerson(undefined,{[field]:'saved'},field,'me'),'saved');
 }
});
