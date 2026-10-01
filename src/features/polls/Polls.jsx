import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../shared/client.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
import './polls.css';
const date=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export default function Polls({onChange}){
 const [history,setHistory]=useState(false),[offset,setOffset]=useState(0),[list,setList]=useState(null),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null);
 const [creating,setCreating]=useState(false),[question,setQuestion]=useState(''),[options,setOptions]=useState(['','']),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [choice,setChoice]=useState(''),[editing,setEditing]=useState(false),[confirmClose,setConfirmClose]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState('');
 const sequence=useRef(0),locked=useRef(false);
 const refresh=useCallback(async()=>{
  const ticket=++sequence.current;
  try{const [rows,item]=await Promise.all([api(`polls?view=${history?'history':'active'}&offset=${offset}`),selected?api(`polls/${selected}`):null]);if(ticket!==sequence.current)return;setList(rows);setDetail(item?.item||null);setError(null);}
  catch(failure){if(ticket===sequence.current)setError(failure);}
 },[history,offset,selected]);
 useEffect(()=>{const invalidate=()=>{sequence.current++;};const timer=setTimeout(refresh,0),focus=()=>{if(!document.hidden)void refresh();};const interval=setInterval(focus,15000);window.addEventListener('focus',focus);return()=>{invalidate();clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus',focus);};},[refresh]);
 async function perform(action,success){if(locked.current)return;locked.current=true;setBusy(true);setError(null);setMessage('');try{await action();setMessage(success);await refresh();await onChange();}catch(failure){if(failure.status===409)await refresh();setError(failure);}finally{locked.current=false;setBusy(false);}}
 const select=id=>{setSelected(id);setDetail(null);setEditing(false);setChoice('');setConfirmClose(false);setMessage('');};
 const modify=()=>setRequestId(crypto.randomUUID());
 return <section className="card polls-page"><div className="section-heading"><h2>Household Polls</h2><button onClick={()=>setCreating(!creating)} disabled={busy}>{creating?'Cancel':'New poll'}</button></div>
  <ErrorMessage error={error}/>{message&&<p role="status">{message}</p>}
  {creating&&<form className="poll-create" onSubmit={e=>{e.preventDefault();perform(async()=>{const result=await api('polls',{method:'POST',body:{id:requestId,question,options}});setCreating(false);setQuestion('');setOptions(['','']);setRequestId(crypto.randomUUID());setHistory(false);setOffset(0);select(result.item.id);},'Poll created.');}}>
   <p className="muted">For your household · closes automatically in 7 days · named results</p>
   <label>Question<input required maxLength={240} value={question} onChange={e=>{setQuestion(e.target.value);modify();}} disabled={busy}/></label>
   <button type="button" className="secondary" disabled={busy} onClick={()=>{setOptions(['Yes','No','Maybe']);modify();}}>Yes / No / Maybe</button>
   <fieldset><legend>Answer choices</legend>{options.map((value,i)=><div className="poll-option-field" key={i}><label>Choice {i+1}<input required maxLength={100} value={value} disabled={busy} onChange={e=>{setOptions(options.map((v,j)=>i===j?e.target.value:v));modify();}}/></label>{options.length>2&&<button type="button" aria-label={`Remove choice ${i+1}`} disabled={busy} onClick={()=>{setOptions(options.filter((_,j)=>j!==i));modify();}}>×</button>}</div>)}</fieldset>
   <div className="actions">{options.length<8&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setOptions([...options,'']);modify();}}>Add choice</button>}<button disabled={busy}>Create poll</button></div>
  </form>}
  <div className="actions"><button className="secondary" aria-pressed={!history} onClick={()=>{setHistory(false);setOffset(0);select(null);}}>Active</button><button className="secondary" aria-pressed={history} onClick={()=>{setHistory(true);setOffset(0);select(null);}}>History</button></div>
  {!list?<p>Loading polls…</p>:!list.items.length?<p>No {history?'past':'active'} polls.</p>:<ul className="poll-list">{list.items.map(p=><li key={p.id}><button className="poll-list-button" aria-expanded={selected===p.id} onClick={()=>select(p.id)}><strong>{p.question}</strong><small>{p.active?(p.own_option_id?`${p.own_option_label} · View results`:'Awaiting your answer'):'Closed'} · {date(p.closed_at||p.expires_at)} Chicago</small></button></li>)}</ul>}
  <div className="actions">{offset>0&&<button className="secondary" onClick={()=>setOffset(Math.max(0,offset-20))}>Previous</button>}{list?.next_offset!==null&&list?.next_offset!==undefined&&<button className="secondary" onClick={()=>setOffset(list.next_offset)}>More polls</button>}</div>
  {detail&&<article className="poll-detail"><h3>{detail.question}</h3><p className="muted">{detail.active?'Closes':'Closed'} {date(detail.closed_at||detail.expires_at)} Chicago · Names and answers are visible to household poll recipients.</p>
   {!!detail.active&&(!detail.own_option_id||editing)?<form onSubmit={e=>{e.preventDefault();perform(async()=>{await api(`polls/${detail.id}/response`,{method:'PUT',body:{option_id:choice,version:detail.response_version}});setEditing(false);},'Answer saved.');}}><fieldset><legend>Choose one answer</legend>{detail.options.map(o=><label className="poll-choice" key={o.id}><input type="radio" name="poll-answer" value={o.id} checked={choice===o.id} onChange={()=>setChoice(o.id)} disabled={busy}/>{o.label}</label>)}</fieldset><button disabled={busy||!choice}>Submit answer</button></form>:<p>Your answer: <strong>{detail.options.find(o=>o.id===detail.own_option_id)?.label||'Not answered'}</strong> {!!detail.active&&<button className="text-button" onClick={()=>{setChoice(detail.own_option_id);setEditing(true);}}>Change answer</button>}</p>}
   <details open={Boolean(detail.own_option_id)||!detail.active}><summary>Results · {detail.responses.filter(r=>r.option_id).length} of {detail.responses.length} answered</summary>
    {detail.options.map(o=><div className="poll-result" key={o.id}><strong>{o.label} — {detail.responses.filter(r=>r.option_id===o.id).length}</strong><details><summary>Names</summary><ul>{detail.responses.filter(r=>r.option_id===o.id).map((r,i)=><li key={i}>{r.first_name} {r.last_name}{!r.available?' · unavailable':''}</li>)}</ul></details></div>)}
    <details><summary>Not answered · {detail.responses.filter(r=>!r.option_id&&r.available).length}</summary><ul>{detail.responses.filter(r=>!r.option_id&&r.available).map((r,i)=><li key={i}>{r.first_name} {r.last_name}{!r.available?' · unavailable':''}</li>)}</ul></details>
   </details>
   {!!detail.active&&!!detail.is_creator&&(confirmClose?<div className="actions"><span>Close now? Answers will be frozen.</span><button disabled={busy} onClick={()=>perform(async()=>{await api(`polls/${detail.id}/close`,{method:'POST',body:{version:detail.version}});setConfirmClose(false);},'Poll closed. It is available in History.')}>Confirm close</button><button className="secondary" onClick={()=>setConfirmClose(false)}>Cancel</button></div>:<button className="text-button" onClick={()=>setConfirmClose(true)}>Close poll early</button>)}
  </article>}
  <a href="#home">Back to Home</a>
 </section>;
}
