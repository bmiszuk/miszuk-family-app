import {DeleteButton} from '../../shared/ui/Shared.jsx';
import {useState} from 'react';
import {maintenanceDeletionConfirmation} from './maintenanceCopy.js';
const mileage=value=>value===null?'—':new Intl.NumberFormat('en-US').format(value);
const name=v=>[v.year,v.make,v.model,v.trim].filter(Boolean).join(' ');
const date=day=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(day+'T12:00:00Z'));
const vehicleFields=[
 ['year','Year','number'],['make','Make','text'],['model','Model','text'],['trim','Trim','text'],['current_mileage','Last-known mileage','number'],['status','Status','status'],['household_id','Household','readonly'],['primary_driver_id','Primary driver','driver'],
 ['vin','VIN','text'],['license_plate','License plate','text'],['purchase_date','Purchase date','date'],['purchase_mileage','Purchase mileage','number'],['engine','Engine','text'],['oil_specification','Oil specification / viscosity','text'],['oil_capacity','Oil capacity','text'],['oil_filter_references','Oil-filter references','filters'],
 ['front_tire_size','Front tire size','text'],['rear_tire_size','Rear tire size','text'],['front_tire_pressure','Front pressure','text'],['rear_tire_pressure','Rear pressure','text'],['driver_wiper_size','Driver wiper','text'],['passenger_wiper_size','Passenger wiper','text'],['rear_wiper_size','Rear wiper','text'],['lug_nut_socket_size','Lug-nut / socket size','text'],['notes','Notes','textarea'],
];
export function VehicleRow({vehicle,onSelect,busy}){return <button className="vehicle-row" disabled={busy} title={name(vehicle)} onClick={()=>onSelect(vehicle.id)}><span>{name(vehicle)}{vehicle.status==='sold_inactive'&&<small> · Sold / Inactive</small>}</span><strong>{mileage(vehicle.current_mileage)} <small>mi</small></strong></button>;}
export function VehicleDetails({vehicle,householdName,drivers=[],busy,onSave,attachments}){
 const [editing,setEditing]=useState(null),[draft,setDraft]=useState(null),[reason,setReason]=useState('');
 const start=key=>{setEditing(key);setDraft(key==='oil_filter_references'?(vehicle[key]||[]).map(filter=>({...filter})):vehicle[key]??'');setReason('');};
 const cancel=()=>{setEditing(null);setDraft(null);setReason('');};
 const save=async event=>{event.preventDefault();if(await onSave(editing,draft,reason))cancel();};
 const driver=drivers.find(person=>person.id===vehicle.primary_driver_id);
 const display=(key,type,value)=>{
  if(type==='status')return value==='active'?'Active':'Sold / Inactive';
  if(type==='driver')return driver?`${driver.first_name} ${driver.last_name||''}`.trim():value?'Reassign or clear previous driver':'Not assigned';
  if(type==='filters')return (value||[]).map(filter=>[filter.brand,filter.part_number].filter(Boolean).join(' ')).filter(Boolean).join('\n')||'None recorded';
  if(key==='current_mileage'||key==='purchase_mileage')return value==null?'Not recorded':`${mileage(value)} mi`;
  if(type==='date')return value?date(value):'Not recorded';
  return value===null||value===undefined||value===''?'Not recorded':value;
 };
 const control=(key,type)=>{
  if(type==='status')return <select aria-label="Status" value={draft} onChange={event=>setDraft(event.target.value)}><option value="active">Active</option><option value="sold_inactive">Sold / Inactive</option></select>;
  if(type==='driver')return <select aria-label="Primary driver" value={draft||''} onChange={event=>setDraft(event.target.value||null)}><option value="">Not assigned</option>{vehicle.primary_driver_id&&!drivers.some(person=>person.id===vehicle.primary_driver_id)&&<option value={vehicle.primary_driver_id}>Reassign or clear previous driver</option>}{drivers.map(person=><option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>)}</select>;
  if(type==='filters')return <div className="vehicle-oil-filter-edit">{draft.map((filter,index)=><div className="vehicle-oil-filter-row" key={index}><label>Brand<input maxLength={100} value={filter.brand} onChange={event=>setDraft(current=>current.map((item,i)=>i===index?{...item,brand:event.target.value}:item))}/></label><label>Part number<input maxLength={100} value={filter.part_number} onChange={event=>setDraft(current=>current.map((item,i)=>i===index?{...item,part_number:event.target.value}:item))}/></label><button type="button" className="quiet" aria-label={`Remove oil filter ${index+1}`} onClick={()=>setDraft(current=>current.filter((_,i)=>i!==index))}>Remove</button></div>)}{draft.length<30&&<button type="button" className="quiet" onClick={()=>setDraft(current=>[...current,{brand:'',part_number:''}])}>+ Add oil filter</button>}</div>;
  if(type==='textarea')return <textarea aria-label="Notes" rows={3} maxLength={10000} value={draft} onChange={event=>setDraft(event.target.value)}/>;
  return <input aria-label={vehicleFields.find(field=>field[0]===key)?.[1]||key} type={type} inputMode={type==='number'?'numeric':undefined} min={type==='number'?0:undefined} step={type==='number'?1:undefined} maxLength={type==='text'?200:undefined} value={draft??''} onChange={event=>setDraft(type==='number'?(event.target.value===''?'':Number(event.target.value)):event.target.value)}/>;
 };
 return <details className="vehicle-specs"><summary>Vehicle details</summary><dl>{vehicleFields.map(([key,label,type])=>{
  const value=key==='household_id'?householdName:vehicle[key];
  if(type==='readonly')return <div className="vehicle-detail-field" key={key}><dt>{label}</dt><dd><span className="vehicle-inline-readonly">{householdName||'Not assigned'}</span></dd></div>;
  return <div className="vehicle-detail-field" key={key}><dt>{label}</dt><dd>{editing===key?<form className="vehicle-inline-edit" onSubmit={save}><div>{control(key,type)}</div>{key==='current_mileage'&&<label>Correction reason<input aria-label="Correction reason" required maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>}<div className="vehicle-inline-actions"><button disabled={busy}>Save</button><button type="button" className="quiet" disabled={busy} onClick={cancel}>Cancel</button></div></form>:<button type="button" className="vehicle-inline-value" aria-label={`Edit ${label}`} disabled={busy||editing!==null} onClick={()=>start(key)}>{display(key,type,value)}</button>}</dd></div>;
 })}</dl>{attachments}</details>;
}
export function MaintenanceRow({record,onEdit,onDelete,busy,attachments}){
 return <article className="maintenance-row"><div className="maintenance-row-heading">
  <button type="button" className="maintenance-row-body" disabled={busy} aria-label={`Edit maintenance: ${record.description}`} onClick={()=>onEdit(record)}>
   <span className="maintenance-row-title"><strong>{record.description}</strong><span>{date(record.service_date)}</span></span>
   <span className="maintenance-meta">{record.mileage!==null&&<span>{mileage(record.mileage)} mi</span>}{record.category&&<span>{record.category}</span>}{record.performed_by&&<span>{record.performed_by}</span>}{record.total_cost_cents!==null&&<span>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(record.total_cost_cents/100)}</span>}</span>
   {record.notes&&<span className="maintenance-notes">{record.notes}</span>}
  </button>
  <DeleteButton compact label={record.description} disabled={busy} confirmationMessage={maintenanceDeletionConfirmation(record.attachment_count)} onDelete={()=>onDelete(record)}/>
 </div>{attachments}</article>;
}
