import {jsonResponse} from './utils.js';
import {parseCoziFeed,feedDigest} from './coziFeed.js';
import {chicagoDate} from '../directoryDates.js';
const MAX_BYTES=2*1024*1024;
async function readFeed(response) {
  if(!response.ok||Number(response.headers.get('content-length'))>MAX_BYTES||!response.body)throw new Error('Feed unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,source='';
  try { while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_BYTES)throw new Error('Feed limit');source+=decoder.decode(value,{stream:true});}return source+decoder.decode(); }
  finally { await reader.cancel(); }
}
export function createCoziHandler({fetcher=fetch,cache=globalThis.caches?.default,clock=()=>new Date()}={}) {
  let memory=null,pending=null;
  return async function handleCozi(request,env) {
    if(request.method!=='GET')return jsonResponse({error:'Calendar is read-only. Make changes in Cozi.'},405);
    const secret=env.COZI_CALENDAR_URL;
    if(!secret)return jsonResponse({error:'Family calendar is not connected yet.'},503);
    const now=clock(),key=await feedDigest(secret),cacheUrl='https://family.miszuk.com/__cozi-cache/v1/'+key+'/'+chicagoDate(now);
    const send=payload=>jsonResponse(payload.body,payload.status);
    if(memory?.key===cacheUrl&&memory.expires>now.getTime())return send(memory.payload);
    if(pending?.key===cacheUrl)return send(await pending.promise);
    const load=async()=>{
      try {
        const stored=await cache?.match(cacheUrl);
        if(stored){const payload=await stored.json();if(payload.expires>now.getTime()){memory={key:cacheUrl,...payload};return payload.payload;}}
      }catch{ /* Cache failure must not prevent a fresh retrieval. */ }
      let payload,ttl;
      try {
        const url=new URL(secret.trim().replace(/^webcal:/i,'https:'));
        if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='cozi.com'||url.hostname.endsWith('.cozi.com')))throw new Error('Invalid feed configuration');
        const response=await fetcher(url.toString(),{headers:{Accept:'text/calendar'},redirect:'manual',signal:AbortSignal.timeout(10000),cache:'no-store'});
        const items=await parseCoziFeed(await readFeed(response),{now});
        payload={status:200,body:{items}};ttl=300;
      }catch{payload={status:503,body:{error:'Cozi calendar is temporarily unavailable. Try again shortly.'}};ttl=60;}
      memory={key:cacheUrl,payload,expires:now.getTime()+ttl*1000};
      try {await cache?.put(cacheUrl,new Response(JSON.stringify({payload,expires:memory.expires}),{headers:{'Content-Type':'application/json','Cache-Control':'max-age='+ttl}}));}catch{ /* The in-memory cache remains usable. */ }
      return payload;
    };
    const promise=load();pending={key:cacheUrl,promise};
    try{return send(await promise);}finally{if(pending?.promise===promise)pending=null;}
  };
}
export const handleCozi=createCoziHandler();
