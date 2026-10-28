import {STORES,useStorePreference} from './store.js';
export default function StorePicker({value,onChange}){
 const [stored,setStored]=useStorePreference();
 const selected=value ?? stored;
 const choose=next=>{if(onChange) onChange(next); else setStored(next);};
 return <div className="grocery-stores" role="group" aria-label="Preferred store">{STORES.map(option=><button key={option.value} type="button" className={selected===option.value?'selected':''} aria-pressed={selected===option.value} onClick={()=>choose(option.value)}>{option.label}</button>)}</div>;
}
