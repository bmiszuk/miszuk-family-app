import {useState,useEffect,useRef} from 'react';
import {api} from './client.js';
import {useAction, useCollection} from './useCollection.js';
import {useDirectory} from './useDirectory.js';
import {CollectionStatus, DeleteButton, SectionHeader, ErrorMessage} from './components/Shared.jsx';
import {chronologicalMessages, senderName, postedTime} from './familyDisplay.js';
function MessageForm({post, busy, onSave, onCancel}) {
  const [body,setBody] = useState(post?.body || '');
  const [notice,setNotice] = useState(Boolean(post?.home_notice));
  return <form className="stack-form chat-composer" onSubmit={async event => {
    event.preventDefault();
    if (await onSave({title:post?.title || 'Chat message',body,home_notice:notice})) {setBody('');setNotice(false);}
  }}>
    {post?.title && post.title !== 'Chat message' && <p className="muted">Headline retained: {post.title}</p>}
    <label>{post ? 'Edit message' : 'Message'}<textarea rows={2} value={body} onChange={event=>setBody(event.target.value)} maxLength={5000} required disabled={busy} /></label>
    <div className="chat-compose-actions">
      <label className="notice-check"><input type="checkbox" checked={notice} onChange={event=>setNotice(event.target.checked)} disabled={busy} />Post to Home screen</label>
      <button disabled={busy || !body.trim()}>{post ? 'Save message' : 'Send'}</button>
      {onCancel && <button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}
export default function FamilyNews({currentPersonId}) {
  const collection=useCollection('news'),directory=useDirectory();
  const action=useAction(collection.refresh);
  const [editor,setEditor]=useState(null);
  const people=directory.data?.people || [];
  const conversation=useRef(null),follow=useRef(true);
  useEffect(()=>{if(follow.current && conversation.current) conversation.current.scrollTop=conversation.current.scrollHeight;},[collection.items]);
  return <section className="card" id="chat" aria-label="Family Chat">
    <SectionHeader icon="news" title="Family Chat" subtitle="A place to leave a message for the family." />
    <ErrorMessage error={directory.error} /><CollectionStatus collection={collection} action={action} />
    {collection.items?.length === 0 && <p className="empty">No messages yet. Say hello to the family.</p>}
    <div className="chat-messages" ref={conversation} tabIndex={0} aria-label="Chat messages" onScroll={event=>{const node=event.currentTarget;follow.current=node.scrollHeight-node.scrollTop-node.clientHeight<60;}}>{chronologicalMessages(collection.items || []).map(post=><article className="chat-message" key={post.id}>
      {editor?.id===post.id ? <MessageForm post={editor} people={people} busy={action.busy} onCancel={()=>setEditor(null)} onSave={async values=>{const saved=await action.run(()=>api(`news/${post.id}`,{method:'PATCH',body:{...values,version:editor.version}}),'Message saved.');if(saved)setEditor(null);return saved;}} /> : <>
        {post.title !== 'Chat message' && <h3>{post.title}</h3>}<div className="chat-line"><span className="prose">{post.body}</span>{' · '}<span className="byline">{senderName(post,people)} · <time dateTime={post.created_at}>{postedTime(post.created_at)}</time>{post.home_notice ? ' · On Home' : ''}</span></div>
        {currentPersonId && post.sender_person_id===currentPersonId && <details className="chat-menu"><summary aria-label="Message actions">•••</summary><div className="chat-message-actions"><button className="text-button" disabled={action.busy || Boolean(editor)} onClick={()=>setEditor(post)}>Edit message</button>
          {!!post.home_notice && <button className="text-button" disabled={action.busy} onClick={()=>action.run(()=>api(`news/${post.id}`,{method:'PATCH',body:{version:post.version,home_notice:false}}),'Removed from Home; message kept in Chat.')}>Remove from Home</button>}
          <DeleteButton label="message" disabled={action.busy || Boolean(editor)} onDelete={()=>action.run(()=>api(`news/${post.id}`,{method:'DELETE',body:{version:post.version}}),'Message removed.')} />
        </div></details>}</>}
    </article>)}</div>
    {currentPersonId ? <MessageForm currentPersonId={currentPersonId} people={people} busy={action.busy || Boolean(editor)} onSave={values=>action.run(()=>api('news',{method:'POST',body:values}),'Message sent.')} /> : <p className="muted">Add your login email to your Directory entry before posting.</p>}
    <p className="sync-note">Refreshes every 15 seconds and when you return. <button className="text-button" onClick={collection.refresh}>Refresh now</button></p>
  </section>;
}
