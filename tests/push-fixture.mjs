import {hkdfSync} from 'node:crypto';
import assert from 'node:assert/strict';
export const encode=value=>Buffer.from(value).toString('base64url');
export async function syntheticPush(){
 const device=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const server=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const publicKey=new Uint8Array(await crypto.subtle.exportKey('raw',device.publicKey));
 const auth=crypto.getRandomValues(new Uint8Array(16));
 const jwk=await crypto.subtle.exportKey('jwk',server.privateKey);
 return {device,server,subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-only',expirationTime:null,keys:{p256dh:encode(publicKey),auth:encode(auth)}},vapid:{subject:'mailto:synthetic@example.test',publicKey:encode(await crypto.subtle.exportKey('raw',server.publicKey)),privateKey:jwk.d}};
}
export async function inspectPush(request,keys,expected){
 assert.equal(request.method,'POST');assert.equal(request.headers.get('content-encoding'),'aes128gcm');assert.equal(request.headers.get('ttl'),'300');
 const authorization=request.headers.get('authorization');assert.ok(authorization.startsWith('vapid t='));
 const token=authorization.slice(8).split(',')[0],parts=token.split('.');
 const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,keys.vapid.subject);assert.ok(claims.exp>Date.now()/1000&&claims.exp<Date.now()/1000+86400);
 assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.server.publicKey,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts[0]+'.'+parts[1])));
 const bytes=new Uint8Array(await request.arrayBuffer());assert.equal(bytes.length,4096);assert.equal(bytes[20],65);
 const salt=bytes.slice(0,16),remote=bytes.slice(21,86),client=Buffer.from(keys.subscription.keys.p256dh,'base64url');
 const remoteKey=await crypto.subtle.importKey('raw',remote,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=await crypto.subtle.deriveBits({name:'ECDH',public:remoteKey},keys.device.privateKey,256);
 const ikm=hkdfSync('sha256',Buffer.from(shared),Buffer.from(keys.subscription.keys.auth,'base64url'),Buffer.concat([Buffer.from('WebPush: info\0'),client,remote]),32);
 const cek=hkdfSync('sha256',Buffer.from(ikm),salt,Buffer.from('Content-Encoding: aes128gcm\0'),16);
 const nonce=hkdfSync('sha256',Buffer.from(ikm),salt,Buffer.from('Content-Encoding: nonce\0'),12);
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']);
 const plaintext=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,bytes.slice(86)));
 let end=plaintext.length-1;while(plaintext[end]===0)end--;assert.equal(plaintext[end],2);
 assert.deepEqual(JSON.parse(new TextDecoder().decode(plaintext.slice(0,end))),expected);
}
