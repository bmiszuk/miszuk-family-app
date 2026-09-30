import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {Miniflare} from 'miniflare';
import {syntheticPush,inspectPush} from './push-fixture.mjs';
test('pinned Web Push library bundles in current Workers runtime and produces decryptable RFC 8291 / signed RFC 8292 requests',async()=>{
 const result=await build({configFile:false,logLevel:'silent',build:{write:false,lib:{entry:'tests/fixtures/push-worker.js',formats:['es']},minify:false}});
 const output=Array.isArray(result)?result[0]:result;
 const keys=await syntheticPush(),payload={version:1,title:'Miszuk Family',body:'Test notification',destination:'home'};let status=201,calls=0,inspectionError;
 const mf=new Miniflare({modules:true,script:output.output.find(c=>c.type==='chunk'&&c.isEntry).code,compatibilityDate:'2026-07-05',outboundService:async request=>{calls++;try{await inspectPush(request,keys,payload);}catch(error){inspectionError=error;throw error;}return new Response(null,{status});}});
 try {
 for(const [code,expected] of [[201,'accepted'],[404,'expired'],[410,'expired'],[401,'configuration'],[403,'configuration'],[429,'temporary'],[503,'temporary'],[400,'rejected']]){
  status=code;const response=await mf.dispatchFetch('http://localhost',{method:'POST',body:JSON.stringify({...keys,device:undefined,server:undefined,payload})});if(inspectionError)throw inspectionError;assert.deepEqual(await response.json(),{result:expected,status:code});
 }
 assert.equal(calls,8);
 } finally {await mf.dispose();}
});
