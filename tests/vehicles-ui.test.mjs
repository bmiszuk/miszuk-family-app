import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sections} from '../src/app/navigation.js';
import {shouldDismissAccountMenu} from '../src/app/accountMenu.js';
const dir=await mkdtemp(join(tmpdir(),'vehicles-ui-')),root=process.cwd().replaceAll('\\','/');
const output=await build({configFile:false,logLevel:'silent',plugins:[{name:'ui-test-entry',resolveId:id=>id==='vehicles-ui-entry'?id:null,load:id=>id==='vehicles-ui-entry'?`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {VehicleForm,MaintenanceForm,MileageForm} from '${root}/src/features/vehicles/VehicleForms.jsx';import {VehicleRow,VehicleDetails,MaintenanceRow} from '${root}/src/features/vehicles/VehicleDetails.jsx';import {maintenanceDeletionConfirmation} from '${root}/src/features/vehicles/maintenanceCopy.js';const render=(c,p)=>renderToStaticMarkup(React.createElement(c,p));export const forms={vehicle:p=>render(VehicleForm,p),maintenance:p=>render(MaintenanceForm,p),mileage:p=>render(MileageForm,p)};export const row=p=>render(VehicleRow,p);export const detail=p=>render(VehicleDetails,p);export const history=p=>render(MaintenanceRow,p);export {maintenanceDeletionConfirmation};`:null}],build:{write:false,ssr:true,rollupOptions:{input:'vehicles-ui-entry'},minify:false},ssr:{noExternal:true}});
const file=join(dir,'render.mjs');await writeFile(file,output.output.find(o=>o.type==='chunk'&&o.isEntry).code);const {forms,row,detail,history,maintenanceDeletionConfirmation}=await import(pathToFileURL(file));await rm(dir,{recursive:true,force:true});
const vehicle={id:'v',year:2017,make:'Toyota',model:'Camry',trim:'SE',status:'active',current_mileage:123456,oil_filter_references:[{brand:'Wix',part_number:'A'}],primary_driver_id:'p',vin:'ABC',notes:'Family car'};
test('dense Vehicles row puts vehicle name and odometer together without Primary driver',()=>{
 const html=row({vehicle});assert.match(html,/2017 Toyota Camry SE/);assert.match(html,/123,456/);assert.match(html,/class="vehicle-row"/);assert.doesNotMatch(html,/Primary driver|Wix|Family car/);
 assert.match(row({vehicle:{...vehicle,status:'sold_inactive',current_mileage:null}}),/Sold \/ Inactive/);
});
test('vehicle create/edit exposes all approved fields, specifications disclosure and no attachment UI',()=>{
 const html=forms.vehicle({vehicle,drivers:[{id:'p',first_name:'Bob'}]});
 for(const name of ['year','make','model','trim','vin','license_plate','status','primary_driver_id','purchase_date','purchase_mileage','current_mileage','engine','oil_specification','oil_capacity','front_tire_size','rear_tire_size','front_tire_pressure','rear_tire_pressure','driver_wiper_size','passenger_wiper_size','rear_wiper_size','lug_nut_socket_size','notes'])assert.ok(html.includes('name="'+name+'"'),name);
 assert.match(html,/Specifications &amp; purchase details/);assert.match(html,/Filter reference/);assert.doesNotMatch(html,/type="file"|Owner|DIY|Provider|Attachment/);
 const details=detail({vehicle,drivers:[{id:'p',first_name:'Bob'}]});assert.match(details,/Vehicle details/);assert.match(details,/Edit vehicle/);assert.match(details,/Correct mileage/);assert.match(details,/Primary driver/);
});
test('maintenance form defaults person and today, optional Category and cost; Description remains primary',()=>{
 const html=forms.maintenance({firstName:'Bob'});assert.match(html,/value="Bob"/);
 for(const name of ['service_date','description'])assert.match(html.match(new RegExp('<input[^>]*name="'+name+'"[^>]*>'))[0],/required/);
 for(const name of ['mileage','category'])assert.doesNotMatch(html.match(new RegExp('<(?:input|select)[^>]*name="'+name+'"[^>]*>'))[0],/required/);
 assert.equal((html.match(/<option/g)||[]).length,14);assert.match(html,/No category/);assert.match(html,/Suspension\/Steering/);assert.doesNotMatch(html,/type="file"|DIY|Provider|Parts/);
 const edit=forms.maintenance({record:{description:'Shop service',performed_by:'Woodhouse',total_cost_cents:4599,service_date:'2026-10-01'}});assert.match(edit,/value="Woodhouse"/);assert.match(edit,/value="45.99"/);
});
test('maintenance body edits and compact × removal stay separate; mileage correction is deliberate',()=>{
 const html=history({record:{id:'m',description:'<script>service</script>',service_date:'2026-10-01',mileage:1234,category:null,performed_by:'Jensen Tire',total_cost_cents:20000,notes:'Check again'}});
 assert.match(html,/&lt;script&gt;service/);assert.match(html,/1,234/);assert.match(html,/Jensen Tire/);assert.match(html,/\$200.00/);assert.match(html,/class="maintenance-row-body"/);assert.match(html,/aria-label="Edit maintenance:/);assert.match(html,/class="icon-delete quiet danger"/);assert.match(html,/×/);assert.doesNotMatch(html,/>Edit<\/button>|>Remove<\/button>|<script>|Created by|Subject/);
 assert.match(forms.mileage({vehicle}).match(/<input[^>]*name="reason"[^>]*>/)[0],/required/);assert.match(forms.mileage({vehicle}),/explicitly replaces/);
});
test('maintenance removal confirmation distinguishes permanently deleted attachments',async()=>{
 assert.equal(maintenanceDeletionConfirmation(0),'Remove this entry?');
 assert.equal(maintenanceDeletionConfirmation(1),'Remove entry? Attached files will be permanently deleted.');
 assert.equal(maintenanceDeletionConfirmation(5),'Remove entry? Attached files will be permanently deleted.');
 const details=await readFile(new URL('../src/features/vehicles/VehicleDetails.jsx',import.meta.url),'utf8');
 assert.match(details,/confirmationMessage=\{maintenanceDeletionConfirmation\(record\.attachment_count\)\}/);
});
test('Vehicles is account-menu navigation only, with no Home card or permanent bottom item',async()=>{
 const app=await readFile(new URL('../src/app/App.jsx',import.meta.url),'utf8');assert.match(app,/href="#vehicles"/);assert.ok(!sections.some(s=>s.id==='vehicles'));
 const home=await readFile(new URL('../src/features/home/Home.jsx',import.meta.url),'utf8');assert.doesNotMatch(home,/Vehicles|vehicles/);
});
test('account menu dismisses on outside pointer input but stays open for inside input',async()=>{
 const inside={},outside={},menu={open:true,contains:target=>target===inside};
 assert.equal(shouldDismissAccountMenu(menu,outside),true);assert.equal(shouldDismissAccountMenu(menu,inside),false);
 menu.open=false;assert.equal(shouldDismissAccountMenu(menu,outside),false);
 const app=await readFile(new URL('../src/app/App.jsx',import.meta.url),'utf8');
 assert.match(app,/addEventListener\('pointerdown', onPointerDown\)/);assert.match(app,/ref=\{accountMenuRef\}/);assert.match(app,/shouldDismissAccountMenu\(menu, event\.target\)/);
 assert.match(app,/<summary>\{member\.person\?\.first_name/);
});
test('Vehicle details disclosure shares the compact history header with mileage and Add maintenance',async()=>{
 const source=await readFile(new URL('../src/features/vehicles/Vehicles.jsx',import.meta.url),'utf8');
 const header=source.slice(source.indexOf('className="vehicle-history-heading"'),source.indexOf('<div className="maintenance-history"'));
 assert.match(header,/vehicle-odometer/);assert.match(header,/<VehicleDetails/);assert.match(header,/\+ Add maintenance/);
});
