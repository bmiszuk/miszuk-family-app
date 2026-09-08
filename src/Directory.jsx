import { useState } from 'react';
import { api } from './client.js';
import { useAction } from './useCollection.js';
import { useDirectory } from './useDirectory.js';
import { ErrorMessage, DeleteButton, SectionHeader } from './components/Shared.jsx';
import { familyDateLabel, parseFamilyDate } from './directoryDates.js';
import Celebrations from './Celebrations.jsx';

const fullName = person => person ? `${person.first_name} ${person.last_name || ''}`.trim() : 'Unknown person';
function DateFields({ value, prefix, title, optional = false }) {
  const date = parseFamilyDate(value);
  return <fieldset className="date-fields"><legend>{title}{optional ? ' (optional)' : ''}</legend>
    <label>Month<input name={`${prefix}_month`} type="number" inputMode="numeric" min="1" max="12" required={!optional} defaultValue={date?.month || ''} /></label>
    <label>Day<input name={`${prefix}_day`} type="number" inputMode="numeric" min="1" max="31" required={!optional} defaultValue={date?.day || ''} /></label>
    <label>Year (optional)<input name={`${prefix}_year`} type="number" inputMode="numeric" min="1000" max={new Date().getFullYear()} defaultValue={date?.year || ''} /></label>
  </fieldset>;
}
function formDate(form, prefix) {
  const month = form.get(`${prefix}_month`), day = form.get(`${prefix}_day`), year = form.get(`${prefix}_year`);
  if (!month && !day && !year) return '';
  return `${year ? `${year}-` : ''}${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function PersonForm({ person, busy, onSave, onCancel }) {
  return <form className="stack-form editor" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void onSave({ first_name: form.get('first_name'), last_name: form.get('last_name'), birth_date: formDate(form, 'birth'), login_email: form.get('login_email') });
  }}><h3>{person ? 'Edit person' : 'Add a person'}</h3>
    <fieldset disabled={busy} className="plain-fields">
      <label>First name<input name="first_name" required maxLength={100} defaultValue={person?.first_name || ''} /></label>
      <label>Last name<input name="last_name" maxLength={100} defaultValue={person?.last_name || ''} /></label>
      <label>Login email (optional)<input name="login_email" type="email" autoCapitalize="none" autoCorrect="off" maxLength={254} defaultValue={person?.login_email || ''} /></label>
      <DateFields value={person?.birth_date} prefix="birth" title="Birthday" optional />
    </fieldset>
    <p className="muted">Leave the birthday blank if unknown. When entered, only month and day are needed. No login or email address is required.</p>
    <div className="actions"><button disabled={busy}>Save person</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
function RelationshipForm({ person, people, busy, onSave }) {
  const [type, setType] = useState('spouse');
  const [otherId, setOtherId] = useState('');
  return <form className="stack-form editor" onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const other = form.get('other');
    const saved = await onSave({ relationship_type: type === 'spouse' ? 'spouse' : 'parent', person1_id: type === 'parent' ? other : person.id, person2_id: type === 'parent' ? person.id : other, anniversary_date: formDate(form, 'wedding') });
    if (saved) setOtherId('');
  }}><h3>Add a relationship</h3>
    <label>Relationship to {person.first_name}<select value={type} disabled={busy} onChange={event => setType(event.target.value)}><option value="spouse">Spouse</option><option value="parent">Parent</option><option value="child">Child</option></select></label>
    <label>Family member<select name="other" required value={otherId} onChange={event => setOtherId(event.target.value)} disabled={busy}><option value="" disabled>Choose a person</option>{people.filter(other => other.id !== person.id).map(other => <option value={other.id} key={other.id}>{fullName(other)} · {familyDateLabel(other.birth_date)}</option>)}</select></label>
    {type === 'spouse' && <DateFields prefix="wedding" title="Wedding anniversary" optional />}
    <button disabled={busy || people.length < 2}>Save relationship</button>
  </form>;
}
function MarriageForm({ relationship, busy, onSave, onCancel }) {
  return <form className="stack-form editor" onSubmit={event => { event.preventDefault(); void onSave({ anniversary_date: formDate(new FormData(event.currentTarget), 'wedding'), version: relationship.version }); }}>
    <DateFields value={relationship.anniversary_date} prefix="wedding" title="Wedding anniversary" optional />
    <div className="actions"><button disabled={busy}>Save anniversary</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
export default function Directory() {
  const directory = useDirectory();
  const action = useAction(directory.refresh);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [marriageEditor, setMarriageEditor] = useState(null);
  const people = directory.data?.people || [], relationships = directory.data?.relationships || [];
  const selected = people.find(person => person.id === selectedId);
  const related = relationships.filter(item => item.person1_id === selectedId || item.person2_id === selectedId);
  const matching = people.filter(person => fullName(person).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const mutate = (path, method, body, notice) => action.run(() => api(`directory/${path}`, { method, body }), notice);
  return <section className="directory-view" aria-label="Family Directory">
    <SectionHeader icon="directory" title="Family Directory" subtitle="The people who make this family ours." count={people.length} />
    <div className="directory-toolbar"><label>Find a person<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search first or last name" /></label><button disabled={Boolean(editor) || action.busy} onClick={() => setEditor({})}>Add person</button><button className="quiet" disabled={action.busy} onClick={directory.refresh}>Refresh directory</button></div>
    <ErrorMessage error={action.error || directory.error} /><p className="save-status" role="status">{action.busy ? 'Saving…' : action.notice}</p>
    {editor && <PersonForm key={editor.id || 'new'} person={editor.id ? editor : null} busy={action.busy} onCancel={() => setEditor(null)} onSave={async values => {
      if (await mutate(editor.id ? `people/${editor.id}` : 'people', editor.id ? 'PATCH' : 'POST', { ...values, ...(editor.id ? { version: editor.version } : {}) }, 'Person saved.')) setEditor(null);
    }} />}
    {!directory.data && !directory.error && <p role="status">Loading directory…</p>}
    <div className={`directory-layout${selected ? ' has-selection' : ''}`}><div className="card directory-list">
      <h3>Family members</h3>
      {!matching.length && directory.data && <p className="empty">{people.length ? 'No matching people.' : 'Add the first family member.'}</p>}
      <ul>{matching.map(person => <li key={person.id}><button className="person-select" aria-pressed={selectedId === person.id} disabled={Boolean(editor) || action.busy} onClick={() => { setSelectedId(person.id); setMarriageEditor(null); }}><strong>{fullName(person)}</strong><span className="muted">Birthday · {familyDateLabel(person.birth_date)}</span></button></li>)}</ul>
    </div>
    <div className="card person-detail">{selected ? <>
      <button className="quiet directory-back" onClick={() => setSelectedId(null)}>All family members</button>
      <h2>{fullName(selected)}</h2><p>Birthday · {familyDateLabel(selected.birth_date)}</p>
      <div className="actions"><button className="quiet" disabled={Boolean(editor) || action.busy} onClick={() => setEditor(selected)}>Edit person</button><DeleteButton label={fullName(selected)} disabled={related.length > 0 || Boolean(editor) || action.busy} onDelete={async () => { const saved = await mutate(`people/${selected.id}`, 'DELETE', { version: selected.version }, 'Person removed.'); if (saved) setSelectedId(null); return saved; }} /></div>
      {related.length > 0 && <p className="muted">Remove relationships below before deleting this person. Other people will be kept.</p>}
      <h3>Relationships</h3>
      {!related.length && <p className="muted">No relationships assigned.</p>}
      <ul className="relationship-list">{related.map(relationship => {
        const other = people.find(person => person.id === (relationship.person1_id === selected.id ? relationship.person2_id : relationship.person1_id));
        const role = relationship.relationship_type === 'spouse' ? 'Spouse' : relationship.relationship_type === 'parent' ? (relationship.person1_id === selected.id ? 'Child' : 'Parent') : relationship.relationship_type;
        return <li key={relationship.id}><p><strong>{role}:</strong> {fullName(other)}</p>
          {relationship.relationship_type === 'spouse' && <p className="muted">Anniversary · {familyDateLabel(relationship.anniversary_date)}</p>}
          <div className="actions">{relationship.relationship_type === 'spouse' && <button className="quiet" disabled={action.busy} onClick={() => setMarriageEditor(relationship)}>Edit anniversary</button>}
            <DeleteButton label={`${role} relationship with ${fullName(other)}`} disabled={action.busy} onDelete={() => mutate(`relationships/${relationship.id}`, 'DELETE', { version: relationship.version }, 'Relationship removed.')} /></div>
          {marriageEditor?.id === relationship.id && <MarriageForm relationship={marriageEditor} busy={action.busy} onCancel={() => setMarriageEditor(null)} onSave={async values => { if (await mutate(`relationships/${relationship.id}`, 'PATCH', values, 'Anniversary saved.')) setMarriageEditor(null); }} />}
        </li>;
      })}</ul>
      <RelationshipForm key={selected.id} person={selected} people={people} busy={action.busy} onSave={values => mutate('relationships', 'POST', values, 'Relationship saved.')} />
    </> : <p className="muted">Select a person to see their birthday and relationships.</p>}</div></div>
    <Celebrations directory={directory} />
  </section>;
}
