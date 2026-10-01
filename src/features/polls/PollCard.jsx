import {useState} from 'react';
const date=value=>new Date(value).toLocaleDateString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric'});
export default function PollCard({poll,detail,onOpen,perform,busy}){
 const [choice,setChoice]=useState(''),[editing,setEditing]=useState(false),[confirmClose,setConfirmClose]=useState(false);
 const item=detail||poll;
 return <article className="poll-card">
  <header className="poll-card-heading"><h3>{item.question}</h3>{!!item.active&&!!item.is_creator&&<details className="poll-overflow"><summary aria-label="Poll actions">···</summary>{confirmClose?<div><p>Close now? Answers will be frozen.</p><button disabled={busy} onClick={()=>perform('close',item.id,{version:item.version},()=>setConfirmClose(false))}>Confirm close</button><button className="poll-quiet" onClick={()=>setConfirmClose(false)}>Cancel</button></div>:<button className="poll-quiet" onClick={()=>setConfirmClose(true)}>Close poll</button>}</details>}</header>
  <p className="poll-meta">{item.active?'Closes':'Closed'} {date(item.closed_at||item.expires_at)}</p>
  {!detail?<button className="poll-quiet" onClick={onOpen}>{item.active&&!item.own_option_id?'Answer poll':`${item.own_option_label?`Your answer: ${item.own_option_label} · `:''}View results`} →</button>:<>
   {!!item.active&&(!item.own_option_id||editing)?<form className="poll-answer" onSubmit={e=>{e.preventDefault();perform('response',item.id,{option_id:choice,version:item.response_version},()=>setEditing(false));}}><fieldset><legend className="sr-only">Choose one answer</legend>{item.options.map(o=><label className="poll-choice" key={o.id}><input type="radio" name={'poll-answer-'+item.id} checked={choice===o.id} onChange={()=>setChoice(o.id)} disabled={busy}/>{o.label}</label>)}</fieldset><button disabled={busy||!choice}>Submit answer</button></form>:<p className="poll-own-answer">Your answer: <strong>{item.options.find(o=>o.id===item.own_option_id)?.label||'Not answered'}</strong>{!!item.active&&<button className="poll-quiet" onClick={()=>{setChoice(item.own_option_id);setEditing(true);}}>Change answer</button>}</p>}
   <div className="poll-results"><p className="poll-meta">{item.responses.filter(r=>r.option_id).length} of {item.responses.length} answered</p><div className="poll-counts">{item.options.map(o=><span key={o.id}>{o.label} <strong>{item.responses.filter(r=>r.option_id===o.id).length}</strong></span>)}</div>
    <details className="poll-breakdown"><summary>Who answered</summary><ul>{item.responses.filter(r=>r.option_id||r.available).map((r,i)=><li key={i}><span>{r.first_name} {r.last_name}{!r.available?' · unavailable':''}</span><strong>{item.options.find(o=>o.id===r.option_id)?.label||'Not answered'}</strong></li>)}</ul></details>
   </div>
  </>}
 </article>;
}
