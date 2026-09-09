import HouseholdManager from './HouseholdManager.jsx';
import {useCollection} from './useCollection.js';
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
function PersonForm({person,relationships,people,currentPersonId,busy,onSave,onCancel,households}) {
  const self=person?.id || 'self';
  const [links,setLinks]=useState(relationships.filter(r=>['parent','spouse'].includes(r.relationship_type)));
  const [type,setType]=useState('parent'),[other,setOther]=useState('');
  const canEdit=id=>currentPersonId && (id===currentPersonId || relationships.some(r=>r.relationship_type==='parent'&&r.person1_id===currentPersonId&&r.person2_id===id));
  const allowed=r=>!person || (r.relationship_type==='parent'?canEdit(r.person2_id):canEdit(r.person1_id)||canEdit(r.person2_id));
  return <form className="stack-form editor" onSubmit={event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);
    void onSave({first_name:form.get('first_name'),last_name:form.get('last_name'),birth_date:formDate(form,'birth'),login_email:form.get('login_email'),household_id:form.get('household_id')||null,relationship_versions:relationships.map(r=>r.id+':'+r.version).sort(),relationships:links.map(r=>({...r,anniversary_date:r.relationship_type==='spouse'?formDate(form,'wedding'+(r.id||r.draftId)):null}))});
  }}><h3>{person?'Edit person':'Add a person'}</h3><fieldset disabled={busy} className="plain-fields">
    <label>First name<input name="first_name" required maxLength={100} defaultValue={person?.first_name||''}/></label>
    <label>Last name<input name="last_name" maxLength={100} defaultValue={person?.last_name||''}/></label>
    <label>Login email (optional)<input name="login_email" type="email" autoCapitalize="none" autoCorrect="off" maxLength={254} defaultValue={person?.login_email||''}/></label>
    <label>Household (optional)<select name="household_id" defaultValue={person?.household_id||''}><option value="">Not assigned</option>{households.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <DateFields value={person?.birth_date} prefix="birth" title="Birthday" optional/>
    <h3>Relationships</h3>
    {links.map((r,i)=>{const otherId=r.person1_id===self?r.person2_id:r.person1_id;return <div className="relationship-draft" key={r.id||r.draftId}>
      <span>{r.relationship_type==='spouse'?'Spouse':r.person2_id===self?'Parent':'Child'}: {fullName(people.find(p=>p.id===otherId))}</span>
      {allowed(r)&&<button type="button" className="text-button danger" onClick={()=>setLinks(links.filter((_,j)=>j!==i))}>Remove relationship</button>}
      {r.relationship_type==='spouse'&&<DateFields value={r.anniversary_date} prefix={'wedding'+(r.id||r.draftId)} title="Wedding anniversary" optional/>}
    </div>})}
    <div className="inline-form"><label>Relationship<select value={type} onChange={e=>setType(e.target.value)}><option value="parent">Parent</option><option value="spouse">Spouse</option>{person&&<option value="child">Child</option>}</select></label>
    <label>Family member<select value={other} onChange={e=>setOther(e.target.value)}><option value="">Choose a person</option>{people.filter(p=>p.id!==self&&(type!=='child'||canEdit(p.id))).map(p=><option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></label>
    <button type="button" disabled={!other} onClick={()=>{setLinks([...links,{draftId:crypto.randomUUID(),relationship_type:type==='spouse'?'spouse':'parent',person1_id:type==='parent'?other:self,person2_id:type==='parent'?self:other,anniversary_date:null}]);setOther('');}}>Add relationship</button></div>
    {person&&<p className="muted">To link a child you cannot edit, their entry must identify you as a parent first.</p>}
  </fieldset><p className="muted">Changes are saved together. Reload after changing your login email or household.</p>
  <div className="actions"><button disabled={busy}>Save</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div></form>;
}
export default function Directory({currentPersonId}) {
  const directory = useDirectory();
  const households = useCollection('households');
  const action = useAction(directory.refresh);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null);
  const people = directory.data?.people || [], relationships = directory.data?.relationships || [];
  const selected = people.find(person => person.id === selectedId);
  const related = relationships.filter(item => item.person1_id === selectedId || item.person2_id === selectedId);
  const canEdit = selected && currentPersonId && (selected.id===currentPersonId || relationships.some(r=>r.relationship_type==='parent'&&r.person1_id===currentPersonId&&r.person2_id===selected.id));
  const matching = people.filter(person => fullName(person).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const mutate = (path, method, body, notice) => action.run(() => api(`directory/${path}`, { method, body }), notice);
  return <section className="directory-view" aria-label="Family Directory">
    <SectionHeader icon="directory" title="Family Directory" subtitle="The people who make this family ours." count={people.length} />
    <HouseholdManager collection={households} people={people} />
    <div className="directory-toolbar"><label>Find a person<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search first or last name" /></label><button disabled={Boolean(editor) || action.busy} onClick={() => setEditor({links:[]})}>Add person</button><button className="quiet" disabled={action.busy} onClick={directory.refresh}>Refresh directory</button></div>
    <ErrorMessage error={action.error || directory.error} /><p className="save-status" role="status">{action.busy ? 'Saving…' : action.notice}</p>
    {editor && households.items && <PersonForm people={people} relationships={editor.links} currentPersonId={currentPersonId} households={households.items || []} key={editor.id || 'new'} person={editor.id ? editor : null} busy={action.busy} onCancel={() => setEditor(null)} onSave={async values => {
      if (await mutate(editor.id ? `people/${editor.id}` : 'people', editor.id ? 'PATCH' : 'POST', { ...values, ...(editor.id ? { version: editor.version } : {}) }, 'Person saved.')) setEditor(null);
    }} />}
    {!directory.data && !directory.error && <p role="status">Loading directory…</p>}
    <div className={`directory-layout${selected ? ' has-selection' : ''}`}><div className="card directory-list">
      <h3>Family members</h3>
      {!matching.length && directory.data && <p className="empty">{people.length ? 'No matching people.' : 'Add the first family member.'}</p>}
      <ul>{matching.map(person => <li key={person.id}><button className="person-select" aria-pressed={selectedId === person.id} disabled={Boolean(editor) || action.busy} onClick={() => { setSelectedId(person.id); }}><strong>{fullName(person)}</strong><span className="muted">Birthday · {familyDateLabel(person.birth_date)}</span></button></li>)}</ul>
    </div>
    <div className="card person-detail">{selected && !editor ? <>
      <button className="quiet directory-back" onClick={() => setSelectedId(null)}>All family members</button>
      <h2>{fullName(selected)}</h2><p>Birthday · {familyDateLabel(selected.birth_date)}</p>
      <p>Household · {households.items?.find(h=>h.id===selected.household_id)?.name || 'Not assigned'}</p><p>Login email · {selected.login_email || 'Not assigned'}</p>
      {canEdit && <div className="actions"><button className="quiet" disabled={Boolean(editor) || action.busy} onClick={() => setEditor({...selected,links:related})}>Edit person</button><DeleteButton label={fullName(selected)} disabled={related.length > 0 || Boolean(editor) || action.busy} onDelete={async () => { const saved = await mutate(`people/${selected.id}`, 'DELETE', { version: selected.version }, 'Person removed.'); if (saved) setSelectedId(null); return saved; }} /></div>}
      {related.length > 0 && <p className="muted">Remove relationships in Edit mode before deleting this person. Other people will be kept.</p>}
      <h3>Relationships</h3>
      {!related.length && <p className="muted">No relationships assigned.</p>}
      <ul className="relationship-list">{related.map(relationship => {
        const other = people.find(person => person.id === (relationship.person1_id === selected.id ? relationship.person2_id : relationship.person1_id));
        const role = relationship.relationship_type === 'spouse' ? 'Spouse' : relationship.relationship_type === 'parent' ? (relationship.person1_id === selected.id ? 'Child' : 'Parent') : relationship.relationship_type;
        return <li key={relationship.id}><p><strong>{role}:</strong> {fullName(other)}</p>
          {relationship.relationship_type === 'spouse' && <p className="muted">Anniversary · {familyDateLabel(relationship.anniversary_date)}</p>}

        </li>;
      })}</ul>
    </> : <p className="muted">Select a person to see their birthday and relationships.</p>}</div></div>
    <Celebrations directory={directory} />
  </section>;
}
