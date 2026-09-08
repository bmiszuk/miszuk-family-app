import {chicagoDate} from './directoryDates.js';
export function addDays(day,count) {const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);}
export function weekStart(today=chicagoDate()) {const weekday=new Date(today+'T00:00:00Z').getUTCDay();return addDays(today,-((weekday+6)%7));}
export function weekDays(start) {return Array.from({length:7},(_,index)=>addDays(start,index));}
export function validDay(day) {return typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;}
