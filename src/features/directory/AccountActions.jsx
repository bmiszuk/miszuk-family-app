import {useState} from 'react';
import {api} from '../../shared/client.js';
import {useAction} from '../../shared/useCollection.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';

export function AccountStatusControls({item,onChanged}) {
 const [review,setReview]=useState(false);
 const action=useAction(async()=>{});
 const operation=item.status==='disabled'?'enable':'disable';
 const next=operation==='disable'?'Disabled':item.identity_state==='bound'?'Active':'Pending (awaiting first sign-in)';
 return <div className="application-access"><ErrorMessage error={action.error}/>{action.error&&<button className="quiet" onClick={onChanged}>Reload access information</button>}
 {!review?<button className="quiet" onClick={()=>setReview(true)}>{operation==='disable'?'Disable access':'Enable access'}</button>:<div className="editor" role="group" aria-label="Review access change">
 <h4>Review access change</h4><p>{item.name} · {item.approved_email||'Identity not configured'}</p><p>Household · {item.household||'Not assigned'}</p><p>Application access: {item.status} → {next}</p>
 <p className="muted">{operation==='disable'?'Access stops on the next API request. Family records and identity are kept. The last usable Administrator cannot be disabled.':'The existing approved identity is kept. An unbound identity must complete its first verified sign-in.'}</p>
 <div className="actions"><button disabled={action.busy} onClick={async()=>{if(await action.run(()=>api('admin/accounts/'+encodeURIComponent(item.id)+'/'+operation,{method:'POST',body:{version:item.version}}),'Access updated.')){setReview(false);await onChanged();}}}>Confirm {operation}</button><button className="quiet" disabled={action.busy} onClick={()=>setReview(false)}>Cancel</button></div>
 </div>}</div>;
}
export function ProvisionAccess({person,household,onChanged}) {
 const [open,setOpen]=useState(false),[email,setEmail]=useState(''),[confirmation,setConfirmation]=useState(''),[review,setReview]=useState(null),[error,setError]=useState('');
 const action=useAction(async()=>{});
 return <div className="application-access"><ErrorMessage error={action.error}/>{action.error&&<button className="quiet" onClick={onChanged}>Reload access information</button>}{error&&<p role="alert">{error}</p>}
 {!open?<button className="quiet" onClick={()=>setOpen(true)}>Provision access</button>:review?<div className="editor" role="group" aria-label="Review provisioning"><h4>Review application access</h4>
 <p>{review.name}</p><p>Login email · {review.login_email}</p><p>Household · {review.household||'Not assigned'}</p><p>Pending Member · Awaiting first sign-in</p>
 <p className="muted">The matching verified Cloudflare sign-in activates access. This does not change Cloudflare admission or send an invitation.</p>
 <div className="actions"><button disabled={action.busy} onClick={async()=>{const {person_id,person_version,login_email,confirm_email}=review;if(await action.run(()=>api('admin/accounts',{method:'POST',body:{person_id,person_version,login_email,confirm_email}}),'Access provisioned.')){setOpen(false);await onChanged();}}}>Confirm provision access</button><button className="quiet" disabled={action.busy} onClick={()=>setReview(null)}>Back</button><button className="quiet" disabled={action.busy} onClick={()=>{setOpen(false);setReview(null);}}>Cancel</button></div>
 </div>:<form className="stack-form editor" onSubmit={event=>{event.preventDefault();if(email.trim().toLowerCase()!==confirmation.trim().toLowerCase()){setError('The login emails must match.');return;}setError('');setReview({person_id:person.id,person_version:person.version,name:[person.first_name,person.last_name].filter(Boolean).join(' '),household,login_email:email.trim().toLowerCase(),confirm_email:confirmation.trim().toLowerCase()});}}>
 <label>Login email<input type="email" required maxLength={254} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Confirm login email<input type="email" required maxLength={254} autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
 <div className="actions"><button>Review access</button><button className="quiet" type="button" onClick={()=>setOpen(false)}>Cancel</button></div></form>}
 </div>;
}

export function AccountSecurityControls({item,onChanged}) {
 const [mode,setMode]=useState(null),[review,setReview]=useState(false),[email,setEmail]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState('');
 const action=useAction(async()=>{});
 const nextRole=item.role==='administrator'?'member':'administrator';
 const cancel=()=>{setMode(null);setReview(false);setEmail('');setConfirmation('');setError('');};
 const submit=async()=>{
  const body=mode==='role'?{version:item.version,role:nextRole}:{version:item.version,login_email:email.trim().toLowerCase(),confirm_email:confirmation.trim().toLowerCase()};
  if(await action.run(()=>api('admin/accounts/'+encodeURIComponent(item.id)+'/'+mode,{method:'POST',body}),'Account updated.')){
   if(item.is_self&&mode==='role'){window.location.reload();return;}
   cancel();await onChanged();
  }
 };
 return <div className="application-access"><ErrorMessage error={action.error}/>{action.error&&<button className="quiet" onClick={onChanged}>Reload access information</button>}{error&&<p role="alert">{error}</p>}
 {!mode?<div className="actions"><button className="quiet" onClick={()=>{setMode('role');setReview(true);}}>Change role</button>{!item.is_self&&<button className="quiet" onClick={()=>setMode('identity')}>Replace login email</button>}</div>
 :review?<div className="editor" role="group" aria-label={mode==='role'?'Review role change':'Review identity replacement'}>
 <h4>{mode==='role'?'Review role change':'Review identity replacement'}</h4><p>{item.name} · {item.approved_email}</p><p>Household · {item.household||'Not assigned'}</p>
 {mode==='role'?<><p>Role: {item.role==='administrator'?'Administrator':'Member'} → {nextRole==='administrator'?'Administrator':'Member'}</p><p className="muted">{nextRole==='administrator'?'Administrator can manage application access, households and relationships. Promote only someone entrusted with these responsibilities.':'Administrator capabilities will be removed. The last usable Administrator cannot be demoted.'} Account status stays {item.status}.</p></>
 :<><p>New approved login email · {email.trim().toLowerCase()}</p><p className="muted">{item.status==='disabled'?'This account stays disabled.':'Current application access will stop and this account becomes Pending.'} The existing login binding will be cleared. The new approved email must complete verified Cloudflare sign-in before access can resume. This does not change Cloudflare admission or send an invitation.</p></>}
 <div className="actions"><button disabled={action.busy} onClick={submit}>{mode==='role'?(nextRole==='administrator'?'Confirm promotion':'Confirm demotion'):'Confirm identity replacement'}</button><button className="quiet" disabled={action.busy} onClick={cancel}>Cancel</button></div>
 </div>:<form className="stack-form editor" onSubmit={event=>{event.preventDefault();if(email.trim().toLowerCase()!==confirmation.trim().toLowerCase()){setError('The login emails must match.');return;}setError('');setReview(true);}}>
 <label>New approved login email<input type="email" required maxLength={254} autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Confirm new login email<input type="email" required maxLength={254} autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
 <div className="actions"><button>Review identity replacement</button><button className="quiet" type="button" onClick={cancel}>Cancel</button></div></form>}
 </div>;
}
