import test from 'node:test';
import assert from 'node:assert/strict';
import {api,onAccessFailure} from '../src/shared/client.js';
test('attachment Blob uploads preserve raw bytes and explicit MIME/filename without changing JSON requests',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response('{}',{headers:{'Content-Type':'application/json'}});};
 const file=new Blob(['%PDF-1.7'],{type:'application/pdf'});
 await api('vehicles/id/attachments',{method:'POST',headers:{'Content-Type':file.type,'X-Attachment-Filename':'Receipt.pdf'},body:file});
 assert.equal(requests[0].options.body,file);assert.equal(requests[0].options.headers['Content-Type'],'application/pdf');assert.equal(requests[0].options.credentials,'same-origin');assert.equal(requests[0].options.cache,'no-store');
 await api('vehicles',{method:'POST',body:{make:'Toyota'}});assert.equal(requests[1].options.body,'{"make":"Toyota"}');
});
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
