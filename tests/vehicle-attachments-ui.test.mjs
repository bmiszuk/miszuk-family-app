import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'vehicle-attachments-ui-')),root=process.cwd().replaceAll('\\','/');
const output=await build({configFile:false,logLevel:'silent',plugins:[{name:'attachment-ui-test',resolveId:id=>id==='attachment-ui-entry'?id:null,load:id=>id==='attachment-ui-entry'?`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {AttachmentList} from '${root}/src/features/vehicles/Attachments.jsx';export const render=p=>renderToStaticMarkup(React.createElement(AttachmentList,p));`:null}],build:{write:false,ssr:true,rollupOptions:{input:'attachment-ui-entry'},minify:false},ssr:{noExternal:true}});
const file=join(dir,'render.mjs');await writeFile(file,output.output.find(o=>o.type==='chunk'&&o.isEntry).code);const {render}=await import(pathToFileURL(file));await rm(dir,{recursive:true,force:true});
const item={id:'file-id',filename:'Receipt <family>.pdf',byte_size:15000,state:'ready'};
test('compact attachments use authenticated open/download links, safe labels, confirmation and a native file picker',()=>{
 const html=render({items:[item],path:'vehicles/id/attachments?administration=true&household_id=scope'});
 assert.match(html,/Receipt &lt;family&gt;.pdf/);assert.match(html,/0.0 MB/);assert.match(html,/rel="noopener noreferrer"/);
 assert.match(html,/\/api\/vehicles\/id\/attachments\/file-id\/file\?administration=true&amp;household_id=scope/);assert.match(html,/download=true/);assert.match(html,/Remove Receipt/);
 assert.match(html,/type="file"/);assert.match(html,/application\/pdf,image\/jpeg,image\/png,image\/heic,image\/heif/);assert.doesNotMatch(html,/\.r2\.dev|amazonaws|Gallery|OCR/);
});
test('five-file quota hides add picker, busy disables mutations, incomplete uploads cannot be opened',()=>{
 assert.doesNotMatch(render({items:Array.from({length:5},(_,i)=>({...item,id:String(i)})),path:'vehicles/id/attachments'}),/type="file"/);
 const html=render({items:[{...item,state:'uploading'}],path:'vehicles/id/maintenance/m/attachments',busy:true});
 assert.match(html,/Upload incomplete/);assert.match(html,/disabled/);assert.doesNotMatch(html,/Download|target="_blank"/);
});
