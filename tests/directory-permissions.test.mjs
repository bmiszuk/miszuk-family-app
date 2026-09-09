import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditDirectoryPerson} from '../src/directoryPermissions.js';
import {householdTitle} from '../src/familyDisplay.js';

test('shared Directory permission rule covers self, parent, both spouses, and unrelated people',()=>{
 const relationships=[{relationship_type:'parent',person1_id:'a',person2_id:'child'},{relationship_type:'spouse',person1_id:'a',person2_id:'b'}];
 assert.equal(canEditDirectoryPerson('a','a',relationships),true);
 assert.equal(canEditDirectoryPerson('a','child',relationships),true);
 assert.equal(canEditDirectoryPerson('a','b',relationships),true);
 assert.equal(canEditDirectoryPerson('b','a',relationships),true);
 assert.equal(canEditDirectoryPerson('b','child',relationships),false);
 assert.equal(canEditDirectoryPerson('other','a',relationships),false);
 assert.equal(canEditDirectoryPerson(null,'a',relationships),false);
 assert.equal(canEditDirectoryPerson('a','b',relationships.map(r=>({...r,deleted_at:'2026-09-09'}))),false);
});
test('household Grocery and Dinner headings use actual household names',()=>{
 for(const [name,base] of [['Miszuk Household','Miszuk'],['Schollmeyer','Schollmeyer'],['  Sutton HOUSEHOLD  ','Sutton'],['Default household','Default'],['Household',''],[undefined,'']]) {
  for(const feature of ['Groceries','Dinner Tonight','Dinner']) assert.equal(householdTitle(name,feature),base?`${base} ${feature}`:feature);
 }
});
