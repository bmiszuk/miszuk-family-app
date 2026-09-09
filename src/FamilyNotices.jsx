import {api} from './client.js';
import {useAction} from './useCollection.js';
import {ErrorMessage} from './components/Shared.jsx';
import {activeNotices,senderName,postedTime} from './familyDisplay.js';
export default function FamilyNotices({collection,people,currentPersonId}) {
  const action=useAction(collection.refresh);
  const notices=activeNotices(collection.items || []).slice(-1);
  return <article className="card summary-card family-notices"><h3>Family Chat</h3>
    <ErrorMessage error={collection.error || action.error} /><p role="status" className="save-status">{action.notice}</p>
    {collection.items === null ? <p>Loading…</p> : !notices.length ? <p>No notices posted.</p> : <div className="notices-list">{notices.map(post=><div className="home-notice" key={post.id}>
      {post.title !== 'Chat message' && <strong>{post.title}</strong>}<p className="prose notice-body">{post.body}</p>
      <p className="byline">{senderName(post,people)} · <time dateTime={post.created_at}>{postedTime(post.created_at)}</time></p>
      {currentPersonId && post.sender_person_id===currentPersonId && <button className="text-button" disabled={action.busy} onClick={()=>action.run(()=>api(`news/${post.id}`,{method:'PATCH',body:{version:post.version,home_notice:false}}),'Removed from Home; message kept in Chat.')}>Remove from Home</button>}
    </div>)}</div>}
    <a href="#chat">Open family chat <span aria-hidden="true">→</span></a>
  </article>;
}
