import { useState } from 'react';
import { api } from './client.js';
import { useAction, useCollection } from './useCollection.js';
import { CollectionStatus, DeleteButton, SectionHeader } from './components/Shared.jsx';
const STORAGE_KEY = 'miszuk-grocery-list';
function oldGroceries() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved || saved === localStorage.getItem(`${STORAGE_KEY}-imported`)) return null;
    const items = JSON.parse(saved);
    if (!Array.isArray(items)) return null;
    const valid = items.filter(item => item && typeof item.name === 'string' && item.name.trim() && item.id != null);
    return valid.length ? { saved, items: valid } : null;
  } catch { return null; }
}
function GroceryForm({ item, busy, onSave, onCancel }) {
  const [name, setName] = useState(item?.name || '');
  const [quantity, setQuantity] = useState(item?.quantity || '');
  return <form className="stack-form grocery-form" onSubmit={async event => {
    event.preventDefault();
    if (await onSave({ name: name.trim(), quantity: quantity.trim(), done: item?.done || false })) { setName(''); setQuantity(''); }
  }}>
    <label>{item ? 'Item name' : 'What do we need?'}<input value={name} onChange={e => setName(e.target.value)} placeholder="Milk, apples, coffee…" maxLength={160} required disabled={busy} /></label>
    <div className="form-row"><label>Quantity <span className="optional">(optional)</span><input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="2 cartons" maxLength={80} disabled={busy} /></label><button type="submit" disabled={busy || !name.trim()}>{item ? 'Save item' : 'Add item'}</button></div>
    {onCancel && <button type="button" className="quiet" onClick={onCancel} disabled={busy}>Cancel editing</button>}
  </form>;
}
export default function GroceryList() {
  const collection = useCollection('groceries');
  const action = useAction(collection.refresh);
  const [editing, setEditing] = useState(null);
  const [legacy, setLegacy] = useState(oldGroceries);
  const items = collection.items || [];
  const save = (item, changes) => action.run(() => api(`groceries/${item.id}`, { method: 'PATCH', body: { ...changes, version: item.version } }));
  return <section className="card" id="groceries" aria-label="Grocery List">
    <SectionHeader icon="🛒" title="Grocery List" subtitle="One list for everyone at home." count={items.filter(item => !item.done).length} />
    {legacy && <div className="import-box"><p>You have {legacy.items.length} items saved on this browser.</p><button disabled={action.busy} onClick={() => action.run(async () => {
      for (let start = 0; start < legacy.items.length; start += 100) await api('groceries/import', { method: 'POST', body: { items: legacy.items.slice(start, start + 100).map(item => ({ legacy_id: String(item.id), name: item.name, done: Boolean(item.done) })) } });
      try { localStorage.setItem(`${STORAGE_KEY}-imported`, legacy.saved); } catch { /* The shared import is already durable. */ }
      setLegacy(null);
    }, 'Your browser list is now shared.')}>Import into shared list</button></div>}
    <GroceryForm busy={action.busy} onSave={values => action.run(() => api('groceries', { method: 'POST', body: values }), 'Item added.')} />
    <CollectionStatus collection={collection} action={action} />
    {collection.items?.length === 0 && <p className="empty">The list is clear. Add the first thing you need.</p>}
    <ul className="grocery-items">{items.map(item => <li key={item.id} className={item.done ? 'grocery-item completed' : 'grocery-item'}>
      {editing?.id === item.id ? <GroceryForm key={editing.id} item={editing} busy={action.busy} onCancel={() => setEditing(null)} onSave={async values => { const saved = await save(editing, values); if (saved) setEditing(null); return saved; }} /> : <>
        <label className="grocery-check"><input type="checkbox" checked={item.done} disabled={action.busy} onChange={() => save(item, { ...item, done: !item.done })} /><span><strong>{item.name}</strong>{item.quantity && <small>{item.quantity}</small>}</span></label>
        <div className="item-actions"><button type="button" className="quiet" disabled={action.busy} onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}>Edit</button><DeleteButton label={item.name} disabled={action.busy} onDelete={() => action.run(() => api(`groceries/${item.id}`, { method: 'DELETE', body: { version: item.version } }), 'Item removed.')} /></div>
      </>}
    </li>)}</ul>
    <p className="sync-note">Refreshes every 15 seconds and when you return. <button className="text-button" onClick={collection.refresh} disabled={action.busy}>Refresh now</button></p>
  </section>;
}
