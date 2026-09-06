import { useState } from 'react';
import { api } from './client.js';
import { useAction, useCollection } from './useCollection.js';
import { CollectionStatus, DeleteButton, SectionHeader } from './components/Shared.jsx';
function NewsForm({ post, busy, onSave, onCancel }) {
  const [title, setTitle] = useState(post?.title || '');
  const [body, setBody] = useState(post?.body || '');
  return <form className="stack-form editor" onSubmit={e => { e.preventDefault(); void onSave({ title, body }); }}>
    <label>Headline<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required disabled={busy} /></label>
    <label>What’s happening?<textarea value={body} onChange={e => setBody(e.target.value)} maxLength={5000} rows={5} required disabled={busy} /></label>
    <div className="actions"><button disabled={busy || !title.trim() || !body.trim()}>{post ? 'Save news' : 'Share news'}</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
export default function FamilyNews() {
  const collection = useCollection('news');
  const action = useAction(collection.refresh);
  const [editor, setEditor] = useState(null);
  return <section className="card" id="news" aria-label="Family News">
    <SectionHeader icon="📢" title="Family News" subtitle="Little updates. Big announcements." />
    {!editor && <button onClick={() => setEditor({})}>Share an update</button>}
    {editor && <NewsForm key={editor.id || 'new'} post={editor.id ? editor : null} busy={action.busy} onCancel={() => setEditor(null)} onSave={async values => {
      const saved = await action.run(() => api(editor.id ? `news/${editor.id}` : 'news', { method: editor.id ? 'PATCH' : 'POST', body: { ...values, ...(editor.id ? { version: editor.version } : {}) } }), 'News saved.');
      if (saved) setEditor(null);
    }} />}
    <CollectionStatus collection={collection} action={action} />
    {collection.items?.length === 0 && <p className="empty">No news yet. Share something with the family.</p>}
    <div className="entries">{collection.items?.map(post => <article className="entry" key={post.id}>
      <p className="byline">{post.author_name} · {new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{post.version > 1 ? ' · edited' : ''}</p>
      <h3>{post.title}</h3><p className="prose">{post.body}</p>
      <div className="item-actions"><button className="quiet" disabled={action.busy || Boolean(editor)} onClick={() => setEditor(post)} aria-label={`Edit ${post.title}`}>Edit</button><DeleteButton label={post.title} disabled={action.busy || Boolean(editor)} onDelete={() => action.run(() => api(`news/${post.id}`, { method: 'DELETE', body: { version: post.version } }), 'News removed.')} /></div>
    </article>)}</div>
  </section>;
}
