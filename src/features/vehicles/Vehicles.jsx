import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../shared/client.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
import {VehicleForm,MaintenanceForm,MileageForm} from './VehicleForms.jsx';
import {VehicleDetails,VehicleRow,MaintenanceRow} from './VehicleDetails.jsx';
import Attachments from './Attachments.jsx';
import './vehicles.css';
export default function Vehicles({member}){
 const admin=member.account.role==='administrator';
 const [households,setHouseholds]=useState([]),[target,setTarget]=useState(''),[selected,setSelected]=useState(null),[offset,setOffset]=useState(0);
 const [list,setList]=useState(null),[vehicle,setVehicle]=useState(null),[history,setHistory]=useState(null),[drivers,setDrivers]=useState([]);
 const [editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
 const [notice,setNotice]=useState(null);
 const sequence=useRef(0),locked=useRef(false);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const household=target||member.household?.id;
 const householdName=target?households.find(h=>h.id===target)?.name:member.household?.name;
 const query=target?`administration=true&household_id=${encodeURIComponent(target)}`:'';
 const path=(resource,page=0)=>`vehicles${resource}${query||page?'?':''}${[query,page?'offset='+page:''].filter(Boolean).join('&')}`;
 const refresh=useCallback(async()=>{
  if(!household)return;const ticket=++sequence.current;
  const suffix=target?'?administration=true&household_id='+encodeURIComponent(target):'';
  try{
   const [data,people]=await Promise.all([api(selected?`vehicles/${selected}${suffix}`:`vehicles${suffix}${offset?(suffix?'&':'?')+'offset='+offset:''}`),api('vehicles/people'+suffix)]);
   let records=null;if(selected)records=await api(`vehicles/${selected}/maintenance${suffix}${offset?(suffix?'&':'?')+'offset='+offset:''}`);
   if(ticket!==sequence.current)return;
   if(selected){setVehicle(data.item);setHistory(records);}else{setList(data);setVehicle(null);setHistory(null);}
   setDrivers(people.items);setError(null);
  }catch(failure){if(ticket===sequence.current)setError(failure);}
 },[household,target,selected,offset]);
 useEffect(()=>{const timer=setTimeout(refresh,0);const focus=()=>{if(!document.hidden&&!locked.current)void refresh();};window.addEventListener('focus',focus);return()=>{invalidate();clearTimeout(timer);window.removeEventListener('focus',focus);};},[refresh,invalidate]);
 useEffect(()=>{if(!admin)return;const controller=new AbortController();api('households',{signal:controller.signal}).then(data=>setHouseholds(data.items)).catch(failure=>{if(failure.name!=='AbortError')setError(failure);});return()=>controller.abort();},[admin]);
 async function perform(action,done){if(locked.current)return false;locked.current=true;setBusy(true);setError(null);setNotice(null);try{const result=await action();if(result?.cleanup_pending)setNotice('Removed. File storage cleanup is pending and will retry automatically.');setEditor(null);if(done)done();await refresh();return true;}catch(failure){if(failure.status===409)await refresh();setError(failure);return false;}finally{locked.current=false;setBusy(false);}}
 function select(id){sequence.current++;setSelected(id);setOffset(0);setEditor(null);setVehicle(null);setHistory(null);setError(null);}
 function chooseHousehold(value){sequence.current++;setTarget(value);select(null);setList(null);setDrivers([]);}
 const heading=vehicle?[vehicle.year,vehicle.make,vehicle.model,vehicle.trim].filter(Boolean).join(' '):'Vehicles';
 return <section className="card vehicles-page" aria-label="Vehicles"><header className="vehicles-heading"><h2>{heading}</h2>{!selected&&household&&!editor&&<button disabled={busy||!list} onClick={()=>setEditor({type:'vehicle'})}>+ Vehicle</button>}{selected&&<button className="quiet" disabled={busy} onClick={()=>select(null)}>All vehicles</button>}</header>
  {admin&&!selected&&<details className="vehicle-admin-scope"><summary>Administrator · household</summary><label>Household<select value={target} disabled={busy||Boolean(editor)} onChange={event=>chooseHousehold(event.target.value)}><option value="">{member.household?.name||'Choose a household'}</option>{households.filter(h=>h.id!==member.household?.id).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>{target&&<small>Explicit cross-household correction mode</small>}</details>}
  <ErrorMessage error={error}/>{notice&&<p role="status" className="muted">{notice}</p>}{busy&&<p role="status" className="muted">Saving…</p>}
  {!household&&<p>No household assigned. Contact Bob to use Vehicles.</p>}
  {editor?.type==='vehicle'&&<VehicleForm key={editor.vehicle?.id||'new'} householdName={householdName} vehicle={editor.vehicle} drivers={drivers} busy={busy} onCancel={()=>setEditor(null)} onSave={body=>perform(async()=>{const result=await api(path(editor.vehicle?'/'+editor.vehicle.id:''),{method:editor.vehicle?'PATCH':'POST',body:{...body,...(editor.vehicle?{version:editor.vehicle.version}:{})}});if(!editor.vehicle)select(result.item.id);})}/>}
  {editor?.type==='maintenance'&&vehicle&&<MaintenanceForm key={editor.record?.id||'new'} record={editor.record} firstName={member.person.first_name.split(/\s+/)[0]} busy={busy} onCancel={()=>setEditor(null)} onSave={body=>perform(async()=>{await api(path('/'+vehicle.id+'/maintenance'+(editor.record?'/'+editor.record.id:'')),{method:editor.record?'PATCH':'POST',body:{...body,vehicle_version:vehicle.version,...(editor.record?{version:editor.record.version}:{})}});if(!editor.record)setOffset(0);})}/>}
  {editor?.type==='mileage'&&vehicle&&<MileageForm vehicle={vehicle} busy={busy} onCancel={()=>setEditor(null)} onSave={body=>perform(()=>api(path('/'+vehicle.id+'/mileage'),{method:'POST',body:{...body,version:vehicle.version}}))}/>}
  {!editor&&household&&!selected&&(!list?<p role="status">Loading vehicles…</p>:<><div className="vehicle-list">{list.items.map(item=><VehicleRow key={item.id} vehicle={item} onSelect={select} busy={busy}/>)}</div>{!list.items.length&&<p className="empty">No vehicles yet.</p>}</>)}
  {!editor&&selected&&(vehicle&&history?<><div className="vehicle-history-heading"><span className="vehicle-odometer">{vehicle.current_mileage===null?'Mileage not recorded':vehicle.current_mileage.toLocaleString('en-US')+' mi'}{vehicle.status==='sold_inactive'&&' · Sold / Inactive'}</span><button disabled={busy} onClick={()=>setEditor({type:'maintenance'})}>+ Add maintenance</button></div>
   <VehicleDetails vehicle={vehicle} householdName={householdName} drivers={drivers} busy={busy} onEdit={()=>setEditor({type:'vehicle',vehicle})} onMileage={()=>setEditor({type:'mileage'})} attachments={<Attachments key={vehicle.id} path={path('/'+vehicle.id+'/attachments')} label="Vehicle files" busy={busy} perform={perform}/>}/>
   <div className="maintenance-history">{history.items.map(record=><MaintenanceRow key={record.id} record={record} busy={busy} onEdit={record=>setEditor({type:'maintenance',record})} onDelete={record=>perform(()=>api(path('/'+vehicle.id+'/maintenance/'+record.id),{method:'DELETE',body:{version:record.version,vehicle_version:vehicle.version}}))} attachments={<Attachments path={path('/'+vehicle.id+'/maintenance/'+record.id+'/attachments')} label="Files" busy={busy} perform={perform}/>}/>)}</div>{!history.items.length&&<p className="empty">No maintenance recorded.</p>}</>:<p role="status">Loading maintenance…</p>)}
  {!editor&&household&&<div className="vehicle-pagination">{offset>0&&<button className="quiet" onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button>}{(selected?history:list)?.next_offset!=null&&<button className="quiet" onClick={()=>setOffset((selected?history:list).next_offset)}>More</button>}</div>}
 </section>;
}
