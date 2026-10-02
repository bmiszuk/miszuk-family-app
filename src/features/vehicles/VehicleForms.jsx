import {useState} from 'react';
import {maintenanceCategories} from '../../domain/vehicles.js';
import {chicagoDate} from '../../domain/directoryDates.js';

const specifications=[['engine','Engine'],['oil_specification','Oil specification / viscosity'],['oil_capacity','Oil capacity'],['front_tire_size','Front tire size'],['rear_tire_size','Rear tire size'],['front_tire_pressure','Front pressure'],['rear_tire_pressure','Rear pressure'],['driver_wiper_size','Driver wiper'],['passenger_wiper_size','Passenger wiper'],['rear_wiper_size','Rear wiper'],['lug_nut_socket_size','Lug-nut / socket size']];
const numeric=value=>value===''?null:Number(value);
export function VehicleForm({vehicle,householdName,drivers=[],busy,onSave,onCancel}){
 const [filters,setFilters]=useState(vehicle?.oil_filter_references||[]);
 const field=(name,label,type='text',required=false)=><label key={name}>{label}<input name={name} type={type} required={required} defaultValue={vehicle?.[name]??''} maxLength={type==='text'?200:undefined} min={type==='number'?0:undefined} step={type==='number'?1:undefined} inputMode={type==='number'?'numeric':undefined}/></label>;
 return <form className="vehicle-form" onInvalid={event=>{const details=event.target.closest('details');if(details)details.open=true;}} onSubmit={event=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  const body=Object.fromEntries(['year','make','model','trim','vin','license_plate','status','primary_driver_id','purchase_date','purchase_mileage','current_mileage','notes',...specifications.map(([name])=>name)].map(name=>[name,form.get(name)]));
  for(const name of ['year','purchase_mileage','current_mileage'])body[name]=numeric(body[name]);
  body.primary_driver_id=body.primary_driver_id||null;body.purchase_date=body.purchase_date||null;body.oil_filter_references=filters;
  void onSave(body);
 }}><h3>{vehicle?'Edit vehicle':'Add vehicle'}</h3>{householdName&&<p className="muted">Household: {householdName}</p>}<fieldset disabled={busy} className="vehicle-fields">
  <div className="vehicle-form-grid">{field('year','Year','number')}{field('make','Make','text',true)}{field('model','Model','text',true)}{field('trim','Trim')}</div>
  <div className="vehicle-form-grid">{field('current_mileage','Last-known mileage','number')}<label>Status<select name="status" defaultValue={vehicle?.status||'active'}><option value="active">Active</option><option value="sold_inactive">Sold / Inactive</option></select></label>
  <label>Primary driver (optional)<select name="primary_driver_id" defaultValue={vehicle?.primary_driver_id||''}><option value="">Not assigned</option>{vehicle?.primary_driver_id&&!drivers.some(p=>p.id===vehicle.primary_driver_id)&&<option value={vehicle.primary_driver_id}>Reassign or clear previous driver</option>}{drivers.map(p=><option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label></div>
  <details className="vehicle-more"><summary>Specifications &amp; purchase details</summary><div className="vehicle-form-grid">{field('vin','VIN')}{field('license_plate','License plate')}{field('purchase_date','Purchase date','date')}{field('purchase_mileage','Purchase mileage','number')}{specifications.map(([name,label])=>field(name,label))}</div>
   <div className="vehicle-filters"><strong>Oil-filter references</strong>{filters.map((filter,index)=><div className="vehicle-filter-row" key={index}><label>Brand<input maxLength={100} value={filter.brand} onChange={e=>setFilters(filters.map((f,i)=>i===index?{...f,brand:e.target.value}:f))}/></label><label>Part number<input required maxLength={100} value={filter.part_number} onChange={e=>setFilters(filters.map((f,i)=>i===index?{...f,part_number:e.target.value}:f))}/></label><button type="button" className="quiet" aria-label={`Remove filter ${index+1}`} onClick={()=>setFilters(filters.filter((_,i)=>i!==index))}>×</button></div>)}{filters.length<30&&<button type="button" className="quiet" onClick={()=>setFilters([...filters,{brand:'',part_number:''}])}>+ Filter reference</button>}</div>
  </details>
  <label>Notes (optional)<textarea name="notes" rows={2} maxLength={10000} defaultValue={vehicle?.notes||''}/></label>
 </fieldset><div className="actions"><button disabled={busy}>Save vehicle</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div></form>;
}
export function MaintenanceForm({record,firstName,busy,onSave,onCancel}){
 return <form className="vehicle-form" onSubmit={event=>{
  event.preventDefault();const form=new FormData(event.currentTarget),cost=form.get('total_cost');
  if(cost&&!/^\d+(?:\.\d{1,2})?$/.test(cost)){event.currentTarget.elements.total_cost.setCustomValidity('Enter a nonnegative amount with at most two decimals.');event.currentTarget.reportValidity();return;}
  void onSave({service_date:form.get('service_date'),mileage:numeric(form.get('mileage')),category:form.get('category')||null,description:form.get('description'),performed_by:form.get('performed_by'),total_cost_cents:cost?Math.round(Number(cost)*100):null,notes:form.get('notes')});
 }}><h3>{record?'Edit maintenance':'Add maintenance'}</h3><fieldset disabled={busy} className="vehicle-fields">
  <div className="vehicle-form-grid"><label>Date<input name="service_date" type="date" required defaultValue={record?.service_date||chicagoDate()}/></label><label>Mileage (optional)<input name="mileage" type="number" inputMode="numeric" min="0" step="1" defaultValue={record?.mileage??''}/></label></div>
  <label>Description<input name="description" required maxLength={500} defaultValue={record?.description||''} placeholder="What was done?"/></label>
  <div className="vehicle-form-grid"><label>Category (optional)<select name="category" defaultValue={record?.category||''}><option value="">No category</option>{maintenanceCategories.map(category=><option key={category}>{category}</option>)}</select></label><label>Performed by<input name="performed_by" maxLength={200} defaultValue={record?record.performed_by:firstName} /></label>
  <label>Total cost (optional)<input name="total_cost" type="text" inputMode="decimal" defaultValue={record?.total_cost_cents===null||record?.total_cost_cents===undefined?'':(record.total_cost_cents/100).toFixed(2)} placeholder="0.00" onChange={e=>e.currentTarget.setCustomValidity('')}/></label></div>
  <label>Notes (optional)<textarea name="notes" rows={2} maxLength={10000} defaultValue={record?.notes||''}/></label>
 </fieldset><div className="actions"><button disabled={busy}>Save maintenance</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div></form>;
}
export function MileageForm({vehicle,busy,onSave,onCancel}){
 return <form className="vehicle-form" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void onSave({current_mileage:numeric(form.get('current_mileage')),reason:form.get('reason')});}}>
  <h3>Correct last-known mileage</h3><fieldset disabled={busy} className="vehicle-fields"><label>Mileage<input name="current_mileage" type="number" inputMode="numeric" min="0" step="1" defaultValue={vehicle.current_mileage??''}/></label><label>Reason<input name="reason" required maxLength={500}/></label></fieldset>
  <p className="muted">This explicitly replaces last-known mileage. Leave blank only to clear it.</p><div className="actions"><button disabled={busy}>Save correction</button><button type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button></div>
 </form>;
}
