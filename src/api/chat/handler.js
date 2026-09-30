import {can} from '../shared/permissions.js';
import {HttpError,stringField} from '../shared/errors.js';
import {boolField,personReference} from '../shared/recordValues.js';
import {handleRecords} from '../shared/records.js';
import {notifyChat} from '../notifications/events.js';
export async function handleChat(request,env,member,id,ctx) {
 const writing=['POST','PATCH','DELETE'].includes(request.method);
 const identity=writing?member:null;
 if(writing && !can(identity,'chat.post')) throw new HttpError(403,'Application access is unavailable.');
 const response=await handleRecords(request,env,member,id,{
  table:'news_posts',order:'created_at DESC, id DESC',fields:['title','body','sender_person_id','home_notice'],authorName:true,
  async values(body,current={}) {return [stringField(body.title ?? 'Chat message','Title',160),stringField(body.body,'News',5000),await personReference(env,body.sender_person_id || null,current.sender_person_id),boolField(body.home_notice ?? false,'Post to Home screen')];},
  async authorizeWrite(body,recordId) {
   if(recordId) {
    const post=await env.DB.prepare('SELECT sender_person_id FROM news_posts WHERE id=? AND deleted_at IS NULL').bind(recordId).first();
    if(!post || !can(identity,'chat.edit',post)) throw new HttpError(403,'You can change only your own messages.');
   }
   body.sender_person_id=identity.person.id;
  },
  normalizeUpdate(merged,current,body) {merged.home_notice=Object.hasOwn(body,'home_notice')?body.home_notice:Boolean(current.home_notice);}
 });
 if(request.method==='POST'&&!id&&response.status===201&&ctx?.waitUntil){
  // All notification work starts after the successful insert, outside its result.
  try {ctx.waitUntil(response.clone().json().then(({item})=>notifyChat(env,item.id,member.account.id)).catch(()=>console.error('chat-notification failed')));}
  catch {console.error('chat-notification scheduling failed');}
 }
 return response;
}
