import {useState} from 'react';
import {useCollection,useAction} from './useCollection.js';
import {useDirectory} from './useDirectory.js';
import {api} from './client.js';
import {ErrorMessage} from './components/Shared.jsx';
import {chicagoDate} from './directoryDates.js';
import {weekStart,weekDays,addDays} from './dinnerDates.js';
import {displayNames,householdTitle} from './familyDisplay.js';
export default function Dinner({member,compact=false}) {
  const [next,setNext]=useState(false);
  const today=chicagoDate(),start=addDays(weekStart(today),next&&!compact?7:0);
  const collection=useCollection(`dinner?start=${start}`),directory=useDirectory();
  const action=useAction(collection.refresh);
  const people=directory.data?.people||[],names=displayNames(people);
  const householdPeople=people.filter(p=>p.household_id===member.household?.id);
  const canAssign=Boolean(member.person?.household_id);
  const row=day=>collection.items?.find(item=>item.day===day);
  const save=(day,personId)=>action.run(()=>api(`dinner/${day}`,{method:'PUT',body:{person_id:personId||null,version:row(day)?.version||0}}),'Dinner saved.');
  const label=day=>names.get(row(day)?.person_id)||'Open';
  return <section className={compact?'card dinner-tonight':'card dinner-week'} aria-label={compact?'Dinner tonight':'Dinner signup'}>
    <div className="dinner-heading"><h2>{householdTitle(member.household?.name,compact?'Dinner Tonight':'Dinner')}</h2></div>
    <ErrorMessage error={action.error||collection.error||directory.error} />
    {compact?<div className="dinner-summary"><strong>{collection.items===null?'Loading…':label(today)}</strong>
      {collection.items!==null&&!row(today)?.person_id&&canAssign&&<button className="text-button" disabled={action.busy} onClick={()=>save(today,member.person.id)}>Claim tonight</button>}
      <a href="#dinner">This week →</a></div>:<>
      <div className="week-switch"><button className={!next?'':'quiet'} onClick={()=>setNext(false)}>This week</button><button className={next?'':'quiet'} onClick={()=>setNext(true)}>Next week</button></div>
      <div className="dinner-days">{weekDays(start).map(day=><label className="dinner-day" key={day}><span>{new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'})}{day===today?' · Today':''}</span>
        <select aria-label={`Dinner ${day}`} value={row(day)?.person_id||''} disabled={!canAssign||action.busy||collection.items===null||Boolean(collection.error)} onChange={event=>save(day,event.target.value)}>
          <option value="">Open</option>{row(day)?.person_id&&!householdPeople.some(p=>p.id===row(day).person_id)&&<option value={row(day).person_id} disabled>{label(day)} (no longer in household)</option>}
          {householdPeople.map(p=><option key={p.id} value={p.id}>{names.get(p.id)}</option>)}
        </select></label>)}</div></>}
    {!canAssign&&<p className="muted household-help">Assign your Directory person to a household to sign up for dinner.</p>}
    <p className="save-status" role="status">{action.notice}</p>
  </section>;
}
