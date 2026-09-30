import {buildPushPayload} from '@block65/webcrypto-web-push';
// Pure transport adapter: callers enforce rollout, ownership and send-time eligibility.
// Never log subscription credentials, VAPID material, payloads or provider bodies.
export async function deliverPush(subscription,vapid,payload,transport=fetch) {
 let request;
 try {request=await buildPushPayload({data:payload,options:{ttl:300,urgency:'normal'}},subscription,vapid);}
 catch {return {result:'configuration',status:null};}
 try {
  const response=await transport(subscription.endpoint,{...request,redirect:'manual',signal:AbortSignal.timeout(10000)});
  const status=response.status;
  await response.body?.cancel();
  return {result:status>=200&&status<300?'accepted':[404,410].includes(status)?'expired':[401,403].includes(status)?'configuration':status===429||status>=500?'temporary':'rejected',status};
 } catch {return {result:'temporary',status:null};}
}

