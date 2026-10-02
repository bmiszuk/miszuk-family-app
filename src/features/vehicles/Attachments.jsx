import {useState} from 'react';
import {api,ApiError} from '../../shared/client.js';
import {ErrorMessage,DeleteButton} from '../../shared/ui/Shared.jsx';
import {attachmentAccept,attachmentLimit,attachmentMaxBytes} from '../../domain/vehicleAttachments.js';

export default function Attachments({path,label='Attachments',busy,perform}){
 const [items,setItems]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(false);
 async function load(){setLoading(true);try{const data=await api(path);setItems(data.items);setError(null);}catch(failure){setError(failure);}finally{setLoading(false);}}
 async function upload(event){
  const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
  if(!file.size||file.size>attachmentMaxBytes){setError(new ApiError('Choose a nonempty file, 10 MB or smaller.',400));return;}
  if(await perform(()=>api(path,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-Attachment-Filename':encodeURIComponent(file.name)},body:file})))await load();
 }
 return <details className="vehicle-attachments" aria-label={label} onToggle={event=>{if(event.currentTarget.open)void load();}}><summary>{label}</summary>
  <ErrorMessage error={error}/>{loading&&<small role="status">Loading files…</small>}
  {items&&<AttachmentList items={items} path={path} busy={busy||loading} onUpload={upload} onDelete={async id=>{if(await perform(()=>api(path.split('?')[0]+'/'+id+(path.includes('?')?'?'+path.split('?')[1]:''),{method:'DELETE'}))){await load();return true;}return false;}}/>}
 </details>;
}
export function AttachmentList({items,path,busy,onUpload,onDelete}){
 const fileUrl=id=>`/api/${path.split('?')[0]}/${id}/file${path.includes('?')?'?'+path.split('?')[1]:''}`;
 return <><ul>{items.map(item=><li key={item.id}><span className="attachment-name">{item.state==='ready'?<a href={fileUrl(item.id)} target="_blank" rel="noopener noreferrer">{item.filename}</a>:<span>{item.filename} · Upload incomplete</span>}<small>{(item.byte_size/1_000_000).toFixed(1)} MB</small></span>{item.state==='ready'&&<a className="quiet" href={fileUrl(item.id)+(path.includes('?')?'&':'?')+'download=true'}>Download</a>}<DeleteButton label={item.filename} disabled={busy} onDelete={()=>onDelete(item.id)}/></li>)}</ul>
  {items.length<attachmentLimit?<label className="attachment-picker quiet">+ Add file<input type="file" accept={attachmentAccept} disabled={busy} onChange={onUpload}/></label>:<small>5 attachments · remove one to add another.</small>}
 </>;
}
