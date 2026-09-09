import {useState} from 'react';
import {api} from './client.js';
import {useAction} from './useCollection.js';
import {ErrorMessage,DeleteButton} from './components/Shared.jsx';
export default function HouseholdManager({collection,people}) {
  const [selected,setSelected]=useState(''),[name,setName]=useState('');
  const occupied=people.some(p=>p.household_id===selected);
  const isDefault=selected==='d47ed638-465c-4f19-a7ab-04bb18a30538';
  const action=useAction(collection.refresh);
  return <details className="household-manager"><summary>Manage households</summary><form className="inline-form" onSubmit={async event=>{event.preventDefault();if(await action.run(()=>api(selected?`households/${selected}`:'households',{method:selected?'PATCH':'POST',body:{name}}),'Household saved.')){setName('');setSelected('');}}}>
    <label>Household<select value={selected} onChange={event=>{setSelected(event.target.value);setName(collection.items?.find(h=>h.id===event.target.value)?.name||'');}}><option value="">New household</option>{collection.items?.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <label>Household name<input required maxLength={100} value={name} onChange={event=>setName(event.target.value)} /></label><button disabled={action.busy}>{selected?'Rename':'Create'}</button>
  </form>{selected && <div className="actions"><DeleteButton key={selected} label="household" disabled={action.busy||occupied||isDefault} onDelete={async()=>{const saved=await action.run(()=>api('households/'+selected,{method:'DELETE'}),'Household removed; stored lists retained.');if(saved){setSelected('');setName('');}return saved;}}/>{occupied?<p className="muted">Move all members out of this household before deleting it.</p>:isDefault?<p className="muted">The default household keeps unassigned groceries available.</p>:null}</div>}<ErrorMessage error={action.error||collection.error} /><p role="status">{action.notice}</p></details>;
}
