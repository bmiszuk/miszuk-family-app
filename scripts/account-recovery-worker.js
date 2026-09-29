// Emergency account-aware maintenance Worker. No family-data router is imported.
import {authenticate,checkOrigin} from '../src/api/shared/auth.js';
import {requireAccount} from '../src/api/shared/accountGate.js';
import {HttpError} from '../src/api/shared/errors.js';
import {jsonResponse} from '../src/api/shared/utils.js';
export default {async fetch(request,env) {
 if(new URL(request.url).pathname.startsWith('/api/')) {
  try {const identity=await authenticate(request,env);checkOrigin(request,env);await requireAccount(env,identity);}
  catch(error) {return jsonResponse({error:'Application access is unavailable.',code:error.code || (error.status===401?'AUTHENTICATION_REQUIRED':'APPLICATION_ACCESS_UNAVAILABLE')},error instanceof HttpError?error.status:503);}
  return jsonResponse({error:'The family portal is temporarily under maintenance.',code:'APPLICATION_ACCESS_UNAVAILABLE'},503);
 }
 return new Response('Miszuk Family is temporarily under maintenance. Please try again later.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}};
