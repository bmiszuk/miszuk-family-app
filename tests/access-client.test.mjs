import test from 'node:test';
import assert from 'node:assert/strict';
import {api,onAccessFailure} from '../src/shared/client.js';
test('access errors revoke sessions, feature denials do not, and late successful responses are ignored',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const errors=[];const unsubscribe=onAccessFailure(e=>errors.push(e));t.after(unsubscribe);
 let finish;
 globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});const late=api('directory');
 const response=(status,code)=>new Response(JSON.stringify({error:'Denied',code}),{status,headers:{'Content-Type':'application/json'}});
 for(const [status,code] of [[403,'APPLICATION_ACCESS_DENIED'],[503,'APPLICATION_ACCESS_UNAVAILABLE'],[401,'AUTHENTICATION_REQUIRED']]) {
  globalThis.fetch=async()=>response(status,code);await assert.rejects(api('me'),e=>e.status===status&&e.code===code);
 }
 assert.equal(errors.length,3);
 finish(new Response('{}',{headers:{'Content-Type':'application/json'}}));await assert.rejects(late,{name:'AbortError'});
 for(const code of ['HOUSEHOLD_REQUIRED',undefined]){globalThis.fetch=async()=>response(403,code);await assert.rejects(api('groceries'));}
 assert.equal(errors.length,3);
 globalThis.fetch=async()=>new Response(JSON.stringify({member:{person:{id:'self'}}}),{headers:{'Content-Type':'application/json'}});
 assert.equal((await api('me')).member.person.id,'self');
 unsubscribe();
});
