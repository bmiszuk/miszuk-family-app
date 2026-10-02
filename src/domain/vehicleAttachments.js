export const attachmentLimit=5;
export const attachmentMaxBytes=10_000_000;
export const attachmentAccept='application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic,.heif';
export function attachmentFilename(value){
 if(typeof value!=='string')return '';
 return value.normalize('NFC').split(/[\\/]/).pop().replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu,'').trim().slice(0,180).toWellFormed();
}
// Validate the file signature as well as its supplied MIME type, never extension alone.
export function attachmentType(bytes){
 if(bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-')return 'application/pdf';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes.length>=16&&String.fromCharCode(...bytes.slice(4,8))==='ftyp'){
  const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if(size>=16&&size<=bytes.length&&size<=4096){
   const brands=[String.fromCharCode(...bytes.slice(8,12))];
   for(let i=16;i+4<=size;i+=4)brands.push(String.fromCharCode(...bytes.slice(i,i+4)));
   if(brands.some(v=>['heic','heix','hevc','hevx','heim','heis'].includes(v)))return 'image/heic';
   if(brands.includes('mif1')&&!brands.some(v=>['avif','avis'].includes(v)))return 'image/heif';
  }
 }
 return null;
}
export function attachmentDisposition(filename,download=false){
 const ascii=filename.replace(/[^\x20-\x7e]|["\\;]/g,'_')||'attachment';
 const encoded=encodeURIComponent(filename).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return `${download?'attachment':'inline'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
