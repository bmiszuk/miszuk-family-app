import {useState} from 'react';
export function PollHome({summary}){
 return <aside className="card polls-home" aria-label="Household polls"><div><strong>Polls</strong>{summary.data?.next&&<span>{summary.data.next.question}</span>}{summary.data&&<small>{summary.data.unanswered_count} unanswered · {summary.data.active_count} active</small>}{summary.error&&<small>Polls could not load.</small>}</div><a href="#polls">{summary.data?.unanswered_count?'Answer / view polls':'Open polls'} →</a></aside>;
}
export function PollNotice({summary,visible}){
 const [dismissed,setDismissed]=useState(false);
 if(!visible||dismissed||!summary.data?.unanswered_count)return null;
 return <aside className="polls-notice"><a href="#polls">{summary.data.unanswered_count} poll{summary.data.unanswered_count===1?'':'s'} to answer</a><button className="text-button" onClick={()=>setDismissed(true)}>Not now</button></aside>;
}
