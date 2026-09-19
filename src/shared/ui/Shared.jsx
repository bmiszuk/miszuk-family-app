import { useState } from 'react';
import Icon from './Icon.jsx';
export function ErrorMessage({ error }) {
  if (!error) return null;
  return <div className="error" role="alert"><p>{error.message}</p>{error.status === 401 && <a href="/cdn-cgi/access/login">Sign in again</a>}{error.status === 409 && <p>If you were editing, cancel and reopen the item to load the latest version.</p>}</div>;
}
export function CollectionStatus({ collection, action }) {
  return <><ErrorMessage error={action.error || collection.error} /><p className="save-status" role="status">{action.busy ? 'Saving…' : action.notice}</p>
    {collection.items === null && !collection.error && <p className="muted" role="status">Loading…</p>}
    {collection.error && <button type="button" className="quiet" onClick={collection.refresh} disabled={action.busy}>Refresh</button>}</>;
}
export function DeleteButton({ label, disabled, onDelete, compact = false }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button type="button" className={compact ? "icon-delete quiet danger" : "quiet danger"} disabled={disabled} onClick={() => setConfirming(true)} aria-label={`Remove ${label}`}>{compact ? <span aria-hidden="true">×</span> : 'Remove'}</button>;
  return <span className="confirm-delete"><span>Remove this?</span><button type="button" className="danger" disabled={disabled} onClick={async () => { if (await onDelete()) setConfirming(false); }}>Yes, remove</button><button type="button" className="quiet" disabled={disabled} onClick={() => setConfirming(false)}>Keep</button></span>;
}
export function SectionHeader({ icon, title, subtitle, count }) {
  return <header className="section-header"><div className="section-title"><h2><span className="section-icon"><Icon name={icon} /></span> {title}</h2>{count !== undefined && <span className="count">{count}</span>}</div>{subtitle && <p className="muted">{subtitle}</p>}</header>;
}
