import { useDirectory } from './useDirectory.js';
import { displayNames, selectedPerson, householdTitle } from './familyDisplay.js';
import PersonSelect from './components/PersonSelect.jsx';
import { ErrorMessage } from './components/Shared.jsx';
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
function GroceryForm({ item, busy, onSave, onCancel, people, currentPersonId }) {
  const [name, setName] = useState(item?.name || '');
  const [selection, setRequester] = useState();
  const requester = selectedPerson(selection, item, 'requester_person_id', currentPersonId);
  const [quantity, setQuantity] = useState(item?.quantity || '');
  return <form className="stack-form grocery-form" onSubmit={async event => {
    event.preventDefault();
    if (await onSave({ name: name.trim(), quantity: quantity.trim(), done: item?.done || false, requester_person_id: requester || null })) { setName(''); setQuantity(''); setRequester(undefined); }
  }}>
    <label>{item ? 'Item name' : 'What do we need?'}<input value={name} onChange={e => setName(e.target.value)} placeholder="Milk, apples, coffee…" maxLength={160} required disabled={busy} /></label>
    <label>Quantity (optional)<input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="2 cartons" maxLength={80} disabled={busy} /></label><PersonSelect label="Requested by (optional)" people={people} value={requester} onChange={setRequester} disabled={busy} /><button type="submit" disabled={busy || !name.trim()}>{item ? 'Save item' : 'Add item'}</button>
    {onCancel && <button type="button" className="quiet" onClick={onCancel} disabled={busy}>Cancel editing</button>}
  </form>;
}
export default function GroceryList({currentPersonId,householdName}) {
  const directory = useDirectory();
  const people = directory.data?.people || [];
  const names = displayNames(people);
  const collection = useCollection('groceries');
  const action = useAction(collection.refresh, 1800);
  const [editing, setEditing] = useState(null);
  const [legacy, setLegacy] = useState(oldGroceries);
  const items = collection.items || [];
  const checked = items.filter(item => item.done).length;
  const [confirmChecked,setConfirmChecked] = useState(false);
  const save = (item, changes) => action.run(() => api(`groceries/${item.id}`, { method: 'PATCH', body: { ...changes, version: item.version } }));
  return <section className="card" id="groceries" aria-label="Grocery List">
    <SectionHeader icon="groceries" title={householdTitle(householdName, 'Groceries')} count={items.filter(item => !item.done).length} />
    {legacy && <div className="import-box"><p>You have {legacy.items.length} items saved on this browser.</p><button disabled={action.busy} onClick={() => action.run(async () => {
      for (let start = 0; start < legacy.items.length; start += 100) await api('groceries/import', { method: 'POST', body: { items: legacy.items.slice(start, start + 100).map(item => ({ legacy_id: String(item.id), name: item.name, done: Boolean(item.done) })) } });
      try { localStorage.setItem(`${STORAGE_KEY}-imported`, legacy.saved); } catch { /* The shared import is already durable. */ }
      setLegacy(null);
    }, 'Your browser list is now shared.')}>Import into shared list</button></div>}
    <ErrorMessage error={directory.error} /><GroceryForm currentPersonId={currentPersonId} people={people} busy={action.busy} onSave={values => action.run(() => api('groceries', { method: 'POST', body: values }), 'Item added.')} />
    <CollectionStatus collection={collection} action={action} />
    {collection.items?.length === 0 && <p className="empty">The list is clear. Add the first thing you need.</p>}
    <p className="grocery-hint muted">Tap an item’s name to edit.</p>
    <ul className="grocery-items">{items.map(item => <li key={item.id} className={item.done ? 'grocery-item completed' : 'grocery-item'}>
      {editing?.id === item.id ? <GroceryForm people={people} key={editing.id} item={editing} busy={action.busy} onCancel={() => setEditing(null)} onSave={async values => { const saved = await save(editing, values); if (saved) setEditing(null); return saved; }} /> : <>
        <div className="grocery-row">
          <label className="grocery-check"><input type="checkbox" aria-label={`Mark ${item.name} as ${item.done ? 'needed' : 'done'}`} checked={item.done} disabled={action.busy} onChange={() => save(item, { ...item, done: !item.done })} /></label>
          <button type="button" className="grocery-text" disabled={action.busy} onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><strong>{item.name}</strong>{item.quantity && <span className="grocery-quantity"> — {item.quantity}</span>}</button>
          {item.requester_person_id && <span className="grocery-requester" title={`Requested by ${names.get(item.requester_person_id) || 'Removed person'}`}>{names.get(item.requester_person_id) || 'Removed person'}</span>}
          <DeleteButton compact label={item.name} disabled={action.busy} onDelete={() => action.run(() => api(`groceries/${item.id}`, { method: 'DELETE', body: { version: item.version } }), 'Item removed.')} />
        </div>
      </>}
    </li>)}</ul>
    {checked > 0 && <div className="actions">{confirmChecked ? <><span>Delete all {checked} checked items?</span><button className="quiet danger" disabled={action.busy} onClick={async()=>{if(await action.run(()=>api('groceries/checked',{method:'DELETE'}),'Checked items removed.')){setConfirmChecked(false);setEditing(null);}}}>Yes, delete checked</button><button className="quiet" disabled={action.busy} onClick={()=>setConfirmChecked(false)}>Cancel</button></> : <button className="text-button danger" disabled={action.busy} onClick={()=>setConfirmChecked(true)}>Delete checked ({checked})</button>}</div>}
    <p className="sync-note">Refreshes every 15 seconds and when you return. <button className="text-button" onClick={collection.refresh} disabled={action.busy}>Refresh now</button></p>
  </section>;
}
