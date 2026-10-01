import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../shared/client.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
import './polls.css';
import PollCard from './PollCard.jsx';
export default function Polls({onChange}){
 const [history,setHistory]=useState(false),[offset,setOffset]=useState(0),[list,setList]=useState(null),[selected,setSelected]=useState(null),[details,setDetails]=useState({});
 const [creating,setCreating]=useState(false),[question,setQuestion]=useState(''),[options,setOptions]=useState(['','']),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [busy,setBusy]=useState(false),[error,setError]=useState(null),[message,setMessage]=useState('');
 const sequence=useRef(0),locked=useRef(false);
 const refresh=useCallback(async()=>{
  const ticket=++sequence.current;
  try{const rows=await api(`polls?view=${history?'history':'active'}&offset=${offset}`);
   const expanded=await Promise.all(rows.items.filter(p=>(!history&&p.own_option_id)||p.id===selected).map(async p=>[p.id,(await api(`polls/${p.id}`)).item]));
   if(ticket!==sequence.current)return;setList(rows);setDetails(Object.fromEntries(expanded));setError(null);}
  catch(failure){if(ticket===sequence.current)setError(failure);}
 },[history,offset,selected]);
 useEffect(()=>{const invalidate=()=>{sequence.current++;};const timer=setTimeout(refresh,0),focus=()=>{if(!document.hidden)void refresh();};const interval=setInterval(focus,15000);window.addEventListener('focus',focus);return()=>{invalidate();clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus',focus);};},[refresh]);
 async function perform(action,success){if(locked.current)return;locked.current=true;setBusy(true);setError(null);setMessage('');try{await action();setMessage(success);await refresh();await onChange();}catch(failure){if(failure.status===409)await refresh();setError(failure);}finally{locked.current=false;setBusy(false);}}
 const select=id=>{setSelected(id);setMessage('');};
 const modify=()=>setRequestId(crypto.randomUUID());
 return <section className="card polls-page"><div className="poll-page-heading"><h2>Household Polls</h2><button onClick={()=>setCreating(!creating)} disabled={busy}>{creating?'Cancel':'New poll'}</button></div>
  <ErrorMessage error={error}/>{message&&<p role="status">{message}</p>}
  {creating&&<form className="poll-create" onSubmit={e=>{e.preventDefault();perform(async()=>{const result=await api('polls',{method:'POST',body:{id:requestId,question,options}});setCreating(false);setQuestion('');setOptions(['','']);setRequestId(crypto.randomUUID());setHistory(false);setOffset(0);select(result.item.id);},'Poll created.');}}>
   <p className="muted">For your household · closes automatically in 7 days · named results</p>
   <label>Question<input required maxLength={240} value={question} onChange={e=>{setQuestion(e.target.value);modify();}} disabled={busy}/></label>
   <button type="button" className="secondary" disabled={busy} onClick={()=>{setOptions(['Yes','No','Maybe']);modify();}}>Yes / No / Maybe</button>
   <fieldset><legend>Answer choices</legend>{options.map((value,i)=><div className="poll-option-field" key={i}><label>Choice {i+1}<input required maxLength={100} value={value} disabled={busy} onChange={e=>{setOptions(options.map((v,j)=>i===j?e.target.value:v));modify();}}/></label>{options.length>2&&<button type="button" aria-label={`Remove choice ${i+1}`} disabled={busy} onClick={()=>{setOptions(options.filter((_,j)=>j!==i));modify();}}>×</button>}</div>)}</fieldset>
   <div className="actions">{options.length<8&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setOptions([...options,'']);modify();}}>Add choice</button>}<button disabled={busy}>Create poll</button></div>
  </form>}
  <div className="poll-filters" role="group" aria-label="Poll view"><button aria-pressed={!history} onClick={()=>{setHistory(false);setOffset(0);select(null);}}>Active</button><button aria-pressed={history} onClick={()=>{setHistory(true);setOffset(0);select(null);}}>History</button></div>
  {!list?<p>Loading polls…</p>:!list.items.length?<p>No {history?'past':'active'} polls.</p>:<div className="poll-list">{list.items.map(p=><PollCard key={p.id} poll={p} detail={details[p.id]} onOpen={()=>select(p.id)} busy={busy} perform={(action,id,body,done)=>perform(async()=>{await api(`polls/${id}/${action}`,{method:action==='response'?'PUT':'POST',body});done();},action==='response'?'Answer saved.':'Poll closed. It is available in History.')}/>)}</div>}
  <div className="actions">{offset>0&&<button className="poll-quiet" onClick={()=>setOffset(Math.max(0,offset-20))}>Previous</button>}{list?.next_offset!==null&&list?.next_offset!==undefined&&<button className="poll-quiet" onClick={()=>setOffset(list.next_offset)}>More polls</button>}</div>
  <a href="#home" className="poll-link">Back to Home</a>
 </section>;
}
