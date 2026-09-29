import {useEffect,useState} from 'react';
import {api} from '../../shared/client.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
import './applicationAccess.css';
function useRead(path) {
 const [state,setState]=useState({});
 useEffect(()=>{
  const controller=new AbortController();
  api(path,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({path,data});}).catch(error=>{if(!controller.signal.aborted)setState({path,error});});
  return ()=>controller.abort();
 },[path]);
 return state.path===path?state:{};
}
function AccountFields({item}) {
 return <dl className="access-fields"><dt>Application access</dt><dd>{item.status==='active'?'Active':item.status==='pending'?'Pending':'Disabled'}</dd>
 <dt>Role</dt><dd>{item.role==='administrator'?'Administrator':'Member'}</dd>
 <dt>Approved login email</dt><dd>{item.approved_email||'Not configured'}</dd>
 <dt>Login identity</dt><dd>{item.identity_state==='bound'?'Bound':item.identity_state==='awaiting_first_sign_in'?'Awaiting first sign-in':'Not configured'}</dd>
 <dt>Household</dt><dd>{item.household||'Not assigned'}</dd></dl>;
}
export function PersonAccess({personId}) {
 const {data,error}=useRead('admin/accounts?person_id='+encodeURIComponent(personId));
 return <section className="application-access" aria-label="Application Access"><h3>Application Access</h3><ErrorMessage error={error}/>
 {data?(data.items.length?<AccountFields item={data.items[0]}/>:<p>No application access</p>):!error&&<p role="status">Loading access…</p>}</section>;
}
function AccountDetail({id}) {
 const {data,error}=useRead('admin/accounts/'+encodeURIComponent(id));
 return <div><ErrorMessage error={error}/>{data?<><h4>{data.item.name}</h4><AccountFields item={data.item}/></>:!error&&<p role="status">Loading account…</p>}</div>;
}
function AuditList() {
 const [offset,setOffset]=useState(0);
 const {data,error}=useRead('admin/security-audit?limit=10&offset='+offset);
 return <section aria-label="Recent security changes"><h3>Recent security changes</h3><ErrorMessage error={error}/>
 {data?<><ul className="access-audit">{data.items.map((item,index)=><li key={offset+index}><strong>{item.action}</strong><small>{item.actor} · {new Date(item.occurred_at.replace(' ','T')+(item.occurred_at.endsWith('Z')?'':'Z')).toLocaleString()}</small></li>)}</ul>{!data.items.length&&<p>No security changes recorded.</p>}
 <div className="actions"><button className="quiet" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-10))}>Newer changes</button><button className="quiet" disabled={data.next_offset===null} onClick={()=>setOffset(data.next_offset)}>Older changes</button></div></>:!error&&<p role="status">Loading security changes…</p>}</section>;
}
function Roster() {
 const [offset,setOffset]=useState(0),[selected,setSelected]=useState(null);
 const {data,error}=useRead('admin/accounts?limit=20&offset='+offset);
 return <div className="application-access"><p className="muted">Administrator · Read only</p><ErrorMessage error={error}/>
 {data?<><ul className="access-roster">{data.items.map(item=><li key={item.id}><button className="person-select" aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)}><strong>{item.name}</strong><span>{item.role==='administrator'?'Administrator':'Member'} · {item.status}</span></button></li>)}</ul>{!data.items.length&&<p>No application accounts.</p>}
 {(offset>0||data.next_offset!==null)&&<div className="actions"><button disabled={!offset} onClick={()=>{setOffset(Math.max(0,offset-20));setSelected(null);}}>Previous accounts</button><button disabled={data.next_offset===null} onClick={()=>{setOffset(data.next_offset);setSelected(null);}}>Next accounts</button></div>}</>:!error&&<p role="status">Loading accounts…</p>}
 {selected&&<AccountDetail key={selected} id={selected}/>}<AuditList/></div>;
}
export default function AccessAdministration() {
 const [open,setOpen]=useState(false);
 return <details className="household-manager" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Application Access · Administrator</summary>{open&&<Roster/>}</details>;
}
