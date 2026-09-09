import {chicagoDate} from './directoryDates.js';
export const COZI_WEB_URL='https://my.cozi.com/';
const timeZone='America/Chicago';
export function coziEventDay(event) {return event.all_day?event.start_at:chicagoDate(new Date(event.start_at));}
export function upcomingCoziEvents(events,now=new Date(),limit=Infinity) {
 const today=chicagoDate(now);
 return events.filter(e=>e.all_day?(e.end_at||e.start_at)>today:(Date.parse(e.end_at||e.start_at)>=now.getTime()))
   .sort((a,b)=>coziEventDay(a).localeCompare(coziEventDay(b))||Number(b.all_day)-Number(a.all_day)||a.start_at.localeCompare(b.start_at)||a.title.localeCompare(b.title)).slice(0,limit);
}
export function coziAgenda(events,now=new Date()) {
 const today=chicagoDate(now),date=new Date(today+'T12:00:00Z');
 date.setUTCDate(date.getUTCDate()+((8-date.getUTCDay())%7||7));
 const nextWeek=date.toISOString().slice(0,10);
 const groups=[{title:'Today',items:[]},{title:'This week',items:[]},{title:'Upcoming',items:[]}];
 for(const event of upcomingCoziEvents(events,now)) {const day=coziEventDay(event);groups[day<=today?0:day<nextWeek?1:2].items.push(event);}
 return groups;
}
export function coziDateLabel(event) {
 const day=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
 if(event.all_day){const end=new Date((event.end_at||event.start_at)+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);const last=end.toISOString().slice(0,10);return day(event.start_at)+(last>event.start_at?' – '+day(last):'')+' · All day';}
 const format=value=>new Date(value).toLocaleString('en-US',{timeZone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 const end=event.end_at&&event.end_at!==event.start_at?(coziEventDay({...event,start_at:event.end_at})===coziEventDay(event)?new Date(event.end_at).toLocaleTimeString('en-US',{timeZone,hour:'numeric',minute:'2-digit'}):format(event.end_at)):'';
 return format(event.start_at)+(end?' – '+end:'');
}
