import { useState } from 'react';
import { api } from './client.js';
import { useAction, useCollection } from './useCollection.js';
import { CollectionStatus, DeleteButton, SectionHeader } from './components/Shared.jsx';
import { eventDateLabel, eventIsPast, localDateTime, toUtc } from './calendar.js';
function EventForm({ event, busy, onSave, onCancel }) {
  const [title, setTitle] = useState(event?.title || '');
  const [allDay, setAllDay] = useState(event?.all_day ?? true);
  const [start, setStart] = useState(event ? (event.all_day ? event.start_at : localDateTime(event.start_at)) : localDateTime().slice(0, 10));
  const [end, setEnd] = useState(event?.end_at ? (event.all_day ? event.end_at : localDateTime(event.end_at)) : '');
  const [location, setLocation] = useState(event?.location || '');
  const [notes, setNotes] = useState(event?.notes || '');
  const [error, setError] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <form className="stack-form editor" onSubmit={e => {
    e.preventDefault(); setError('');
    try {
      const startAt = allDay ? start : toUtc(start);
      const endAt = end ? (allDay ? end : toUtc(end)) : null;
      if (endAt && (endAt < startAt || (!allDay && endAt === startAt))) throw new Error('End must be after the start.');
      void onSave({ title, all_day: allDay, start_at: startAt, end_at: endAt, timezone, location, notes });
    } catch (failure) { setError(failure.message); }
  }}>
    <label>Event title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required disabled={busy} /></label>
    <label className="check-label"><input type="checkbox" checked={allDay} disabled={busy} onChange={e => {
      const checked = e.target.checked; setAllDay(checked);
      setStart(start ? (checked ? start.slice(0, 10) : `${start.slice(0, 10)}T09:00`) : '');
      setEnd(end ? (checked ? end.slice(0, 10) : `${end.slice(0, 10)}T10:00`) : '');
    }} />All day</label>
    <label>Starts<input type={allDay ? 'date' : 'datetime-local'} value={start} onChange={e => setStart(e.target.value)} required disabled={busy} /></label>
    <label>Ends <span className="optional">(optional{allDay ? ', inclusive' : ''})</span><input type={allDay ? 'date' : 'datetime-local'} value={end} min={start} onChange={e => setEnd(e.target.value)} disabled={busy} /></label>
    {!allDay && <p className="muted">Times entered in {timezone}.</p>}
    <label>Location <span className="optional">(optional)</span><input value={location} onChange={e => setLocation(e.target.value)} maxLength={240} disabled={busy} /></label>
    <label>Notes <span className="optional">(optional)</span><textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={5000} rows={3} disabled={busy} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={busy || !title.trim() || !start}>{event ? 'Save event' : 'Add event'}</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
export default function Calendar() {
  const collection = useCollection('events');
  const action = useAction(collection.refresh);
  const [editor, setEditor] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const events = (collection.items || []).filter(event => showPast || !eventIsPast(event));
  return <section className="card" id="calendar" aria-label="Calendar">
    <SectionHeader icon="📅" title="Calendar" subtitle="Make room for time together." />
    {!editor && <button onClick={() => setEditor({})}>Add an event</button>}
    {editor && <EventForm key={editor.id || 'new'} event={editor.id ? editor : null} busy={action.busy} onCancel={() => setEditor(null)} onSave={async values => {
      const saved = await action.run(() => api(editor.id ? `events/${editor.id}` : 'events', { method: editor.id ? 'PATCH' : 'POST', body: { ...values, ...(editor.id ? { version: editor.version } : {}) } }), 'Event saved.');
      if (saved) setEditor(null);
    }} />}
    <CollectionStatus collection={collection} action={action} />
    <label className="check-label past-toggle"><input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />Include past events</label>
    {collection.items !== null && events.length === 0 && <p className="empty">{showPast ? 'No events yet.' : 'Nothing coming up yet.'} Add something to look forward to.</p>}
    <div className="entries">{events.map(event => <article className="entry" key={event.id}>
      <p className="event-date">{eventDateLabel(event)}</p><h3>{event.title}</h3>
      {event.location && <p className="location">{event.location}</p>}{event.notes && <p className="prose">{event.notes}</p>}
      <p className="byline">Added by {event.author_name}</p>
      <div className="item-actions"><button className="quiet" disabled={action.busy || Boolean(editor)} onClick={() => setEditor(event)} aria-label={`Edit ${event.title}`}>Edit</button><DeleteButton label={event.title} disabled={action.busy || Boolean(editor)} onDelete={() => action.run(() => api(`events/${event.id}`, { method: 'DELETE', body: { version: event.version } }), 'Event removed.')} /></div>
    </article>)}</div>
    <p className="sync-note">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}. All-day dates stay the same wherever you are.</p>
  </section>;
}
