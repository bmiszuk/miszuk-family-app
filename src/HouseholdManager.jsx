import {useState} from 'react';
import {api} from './client.js';
import {useAction} from './useCollection.js';
import {ErrorMessage} from './components/Shared.jsx';
export default function HouseholdManager({collection}) {
  const [selected,setSelected]=useState(''),[name,setName]=useState('');
  const action=useAction(collection.refresh);
  return <details className="household-manager"><summary>Manage households</summary><form className="inline-form" onSubmit={async event=>{event.preventDefault();if(await action.run(()=>api(selected?`households/${selected}`:'households',{method:selected?'PATCH':'POST',body:{name}}),'Household saved.')){setName('');setSelected('');}}}>
    <label>Household<select value={selected} onChange={event=>{setSelected(event.target.value);setName(collection.items?.find(h=>h.id===event.target.value)?.name||'');}}><option value="">New household</option>{collection.items?.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <label>Household name<input required maxLength={100} value={name} onChange={event=>setName(event.target.value)} /></label><button disabled={action.busy}>{selected?'Rename':'Create'}</button>
  </form><ErrorMessage error={action.error||collection.error} /><p role="status">{action.notice}</p></details>;
}
