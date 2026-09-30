import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
test('notification-only service worker validates payloads and routes clicks within the portal',async()=>{
 const events={},shown=[],opened=[];let focused=0;
 const self={location:{origin:'https://family.miszuk.com'},addEventListener:(name,fn)=>{events[name]=fn;},registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(source,{self,URL});
 assert.deepEqual(Object.keys(events).sort(),['notificationclick','push']);
 async function push(value){let promise;events.push({data:{json:()=>value},waitUntil:p=>{promise=p;}});await promise;return shown.at(-1);}
 assert.equal((await push({version:1,title:'Miszuk Family',body:'Test notification',destination:'chat'})).data.destination,'chat');
 for(const destination of ['https://evil.test','//evil.test','javascript:alert(1)','__proto__','unknown'])assert.equal((await push({version:1,title:'x',body:'x',destination})).data.destination,'home');
 assert.equal((await push({version:2,title:'x',body:'x',destination:'chat'})).title,'Miszuk Family');
 async function click(destination){let promise;events.notificationclick({notification:{data:{destination},close(){}},waitUntil:p=>{promise=p;}});await promise;}
 await click('https://evil.test');assert.equal(opened.at(-1),'https://family.miszuk.com/#home');
 self.clients.matchAll=async()=>[{url:'https://evil.test',navigate:()=>assert.fail('foreign client')},{url:'https://family.miszuk.com/#home',navigate:async url=>{assert.equal(url,'https://family.miszuk.com/#chat');return {focus:async()=>focused++};}}];
 await click('chat');assert.equal(focused,1);
});
test('notification registration never requests permission; only explicit enrollment can prompt',async()=>{
 const {registerWorker,browserStatus}=await import('../src/features/notifications/browser.js');
 const previousWindow=globalThis.window,previousNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');let registrations=0;
 globalThis.window={isSecureContext:true};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async()=>{registrations++;return {};}}}});
 try{await registerWorker();assert.equal(registrations,1);}finally{globalThis.window=previousWindow;Object.defineProperty(globalThis,'navigator',previousNav);}
 assert.match(browserStatus({navigator:{userAgent:'iPhone'},matchMedia:()=>({matches:false})}),/Home Screen/);
 assert.match(browserStatus({navigator:{userAgent:'test'},isSecureContext:false}),/not supported/);
});

test('iPhone pilot enrollment requires Home Screen support and permission eligibility',async()=>{
 const {canEnroll}=await import('../src/features/notifications/browser.js');
 const browser={isSecureContext:true,navigator:{userAgent:'iPhone',serviceWorker:{}},PushManager:{},Notification:{permission:'default'},matchMedia:()=>({matches:false})};
 assert.equal(canEnroll(browser),false);browser.navigator.standalone=true;assert.equal(canEnroll(browser),true);
 browser.Notification.permission='denied';assert.equal(canEnroll(browser),false);browser.Notification.permission='granted';assert.equal(canEnroll(browser),true);
 delete browser.PushManager;assert.equal(canEnroll(browser),false);
});
