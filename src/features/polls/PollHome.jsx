import {useRef,useState} from 'react';
import {api} from '../../shared/client.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
export function PollHome({summary}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(null),locked=useRef(false);
 const next=summary.data?.next,active=summary.data?.active_count||0;
 async function vote(option){if(locked.current)return;locked.current=true;setBusy(true);setError(null);try{await api(`polls/${next.id}/response`,{method:'PUT',body:{option_id:option,version:next.response_version}});await summary.refresh();}catch(failure){if(failure.status===409||failure.status===404)await summary.refresh();setError(failure);}finally{locked.current=false;setBusy(false);}}
 return <aside className="card polls-home" aria-label="Household polls">
  {next?.active&&!next.own_option_id?<><div className="poll-home-heading"><strong>{next.question}</strong><a href="#polls" className="poll-link">View polls →</a></div><div className="poll-home-choices">{next.options.map(o=><button className="poll-choice-button" key={o.id} disabled={busy} onClick={()=>vote(o.id)}>{o.label}</button>)}</div>{summary.data.unanswered_count>1&&<small>{summary.data.unanswered_count-1} more unanswered · {active} active</small>}{busy&&<small role="status">Saving answer…</small>}</>:<div className="poll-home-heading"><span>{active?`You're caught up · ${active} active`:'Polls'}</span><a href="#polls" className="poll-link">{active?'View polls':'Open polls'} →</a></div>}
  <ErrorMessage error={error}/>{summary.error&&<small>Polls could not load.</small>}
 </aside>;
}
export function PollNotice({summary,visible}){
 const [dismissed,setDismissed]=useState(false);
 if(!visible||dismissed||!summary.data?.unanswered_count)return null;
 return <aside className="polls-notice"><a href="#polls">{summary.data.unanswered_count} poll{summary.data.unanswered_count===1?'':'s'} to answer</a><button className="text-button" onClick={()=>setDismissed(true)}>Not now</button></aside>;
}
