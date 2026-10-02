import {validDay} from './dinnerDates.js';
import {chicagoDate} from './directoryDates.js';

export const maintenanceCategories=Object.freeze(['Oil & Filter','Tires','Brakes','Battery','Fluids','Engine','Transmission','Suspension/Steering','Electrical','HVAC','Body/Glass','Inspection','Other']);
export class VehicleValidationError extends Error {}
const fail=message=>{throw new VehicleValidationError(message);};
const text=(value,label,max,required=false)=>{
 if(value===undefined||value===null)value='';
 if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(`Invalid ${label}.`);
 return value.trim();
};
function number(value,label,max=Number.MAX_SAFE_INTEGER){
 if(value===undefined||value===null||value==='')return null;
 if(!Number.isSafeInteger(value)||value<0||value>max)fail(`Invalid ${label}.`);
 return value;
}
function date(value,label){
 if(value===undefined||value===null||value==='')return null;
 if(!validDay(value))fail(`Invalid ${label}.`);return value;
}
const specFields=['trim','vin','license_plate','engine','oil_specification','oil_capacity','front_tire_size','rear_tire_size','front_tire_pressure','rear_tire_pressure','driver_wiper_size','passenger_wiper_size','rear_wiper_size','lug_nut_socket_size'];
export const vehicleFields=Object.freeze(['year','make','model',...specFields,'status','primary_driver_id','purchase_date','purchase_mileage','current_mileage','oil_filter_references','notes']);
export const maintenanceFields=Object.freeze(['service_date','mileage','category','description','performed_by','total_cost_cents','notes']);
export function allowedFields(body,allowed){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!allowed.includes(key)))fail('Unsupported vehicle fields.');
}
export function vehicleValues(body){
 const year=number(body.year,'year',9999);if(year!==null&&year<1886)fail('Invalid year.');
 const filters=body.oil_filter_references??[];
 if(!Array.isArray(filters)||filters.length>30)fail('Invalid oil-filter references.');
 const oil_filter_references=filters.map(filter=>{
  allowedFields(filter,['brand','part_number']);
  return {brand:text(filter.brand,'filter brand',100),part_number:text(filter.part_number,'filter part number',100,true)};
 });
 const status=body.status??'active';if(!['active','sold_inactive'].includes(status))fail('Invalid vehicle status.');
 const primary_driver_id=body.primary_driver_id===undefined||body.primary_driver_id===''?null:body.primary_driver_id;
 if(primary_driver_id!==null&&typeof primary_driver_id!=='string')fail('Invalid primary driver.');
 return {year,make:text(body.make,'make',100,true),model:text(body.model,'model',100,true),
  ...Object.fromEntries(specFields.map(key=>[key,text(body[key],key,200)])),status,primary_driver_id,
  purchase_date:date(body.purchase_date,'purchase date'),purchase_mileage:number(body.purchase_mileage,'purchase mileage'),
  current_mileage:number(body.current_mileage,'current mileage'),oil_filter_references,notes:text(body.notes,'notes',10000)};
}
export function maintenanceValues(body,{firstName='',today=chicagoDate()}={}){
 const category=body.category===undefined||body.category===null||body.category===''?null:body.category;
 if(category!==null&&!maintenanceCategories.includes(category))fail('Invalid maintenance category.');
 return {service_date:date(body.service_date??today,'service date')||today,mileage:number(body.mileage,'mileage'),category,
  description:text(body.description,'description',500,true),performed_by:text(body.performed_by===undefined?firstName:body.performed_by,'performed by',200),
  total_cost_cents:number(body.total_cost_cents,'total cost'),notes:text(body.notes,'notes',10000)};
}
// Maintenance never lowers last-known mileage, including edits/deletions of old records.
export function advanceMileage(current,next){return next===null?current:current===null?next:Math.max(current,next);}
