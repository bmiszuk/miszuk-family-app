import {useEffect,useState} from 'react';
export const STORES=[{value:'costco',label:'Costco'},{value:'walmart',label:'Walmart'},{value:'aldi',label:'Aldi'},{value:'any',label:'Any'}];
const KEY='miszuk-grocery-store';
export function useStorePreference(){
 const [store,setStoreState]=useState(()=>{try{return localStorage.getItem(KEY)||'any';}catch{/* localStorage may be unavailable */return 'any';}});
 useEffect(()=>{const onChange=event=>setStoreState(event.detail||'any');window.addEventListener('miszuk-grocery-store-change',onChange);return()=>window.removeEventListener('miszuk-grocery-store-change',onChange);},[]);
 const setStore=value=>{const next=STORES.some(option=>option.value===value)?value:'any';try{localStorage.setItem(KEY,next);}catch{/* localStorage may be unavailable */} setStoreState(next);window.dispatchEvent(new CustomEvent('miszuk-grocery-store-change',{detail:next}));};
 return [store,setStore];
}
export function storeLabel(value){return STORES.find(option=>option.value===value)?.label||'Any';}
