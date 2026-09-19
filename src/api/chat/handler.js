import {householdIdentity} from '../shared/identity.js';
import {can} from '../shared/permissions.js';
import {HttpError,stringField} from '../shared/errors.js';
import {boolField,personReference} from '../shared/recordValues.js';
import {handleRecords} from '../shared/records.js';
export async function handleChat(request,env,member,id) {
 const writing=['POST','PATCH','DELETE'].includes(request.method);
 const identity=writing?await householdIdentity(env,member):null;
 if(writing && !can(identity,'chat.post')) throw new HttpError(403,'Add your login email to your Directory entry before posting.');
 return handleRecords(request,env,member,id,{
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
}
