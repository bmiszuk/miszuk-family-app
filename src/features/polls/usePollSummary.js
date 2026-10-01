import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../shared/client.js';
export function usePollSummary(userId,householdId){
 const [state,setState]=useState({data:null,error:null});
 const sequence=useRef(0);
 const refresh=useCallback(async()=>{
  if(!userId||!householdId)return;
  const ticket=++sequence.current;
  try {const data=await api('polls/summary');if(ticket===sequence.current)setState({data,error:null,userId,householdId});}
  catch(error){if(ticket===sequence.current&&error.name!=='AbortError')setState({data:null,error,userId,householdId});}
 },[userId,householdId]);
 useEffect(()=>{if(!userId||!householdId)return;const invalidate=()=>{sequence.current++;};const timer=setTimeout(refresh,0);const focus=()=>{if(!document.hidden)void refresh();};const interval=setInterval(focus,15000);window.addEventListener('focus',focus);return()=>{invalidate();clearTimeout(timer);clearInterval(interval);window.removeEventListener('focus',focus);};},[refresh,userId,householdId]);
 return {...(state.userId===userId&&state.householdId===householdId?state:{data:null,error:null}),refresh};
}
