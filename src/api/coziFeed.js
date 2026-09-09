import ICAL from 'ical.js';
import {Temporal} from '@js-temporal/polyfill';

const ZONE='America/Chicago';
export const feedDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
// eslint-disable-next-line no-control-regex -- Remove nonprinting control characters from feed display fields.
const text=value=>String(value||'').replace(/(?:https?|webcal):\/\/\S+/gi,'[link omitted]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,500);
const cancelled=event=>String(event.component.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED';

function timezones(calendar) {
  // Use feed VTIMEZONE definitions first. Temporal supplies IANA zones when omitted.
  const embedded=calendar.getTimeZoneByID.bind(calendar),zones=new Map();
  calendar.getTimeZoneByID=id=>{
    const defined=embedded(id);if(defined)return defined;
    if(!zones.has(id)) {
      Temporal.ZonedDateTime.from({timeZone:id,year:2026,month:1,day:1});
      const zone=new ICAL.Timezone({tzid:id});
      zone.utcOffset=t=>Temporal.ZonedDateTime.from({timeZone:id,year:t.year,month:t.month,day:t.day,hour:t.hour,minute:t.minute,second:t.second},{disambiguation:'compatible'}).offsetNanoseconds/1e9;
      zones.set(id,zone);
    }
    return zones.get(id);
  };
  const defaultZone=calendar.getFirstPropertyValue('x-wr-timezone')||ZONE;
  for(const component of calendar.getAllSubcomponents('vevent')) {
    for(const name of ['dtstart','dtend','recurrence-id','rdate','exdate'])for(const property of component.getAllProperties(name)) {
      if(property.type==='date-time'&&!property.getParameter('tzid')&&!String(property.jCal[3]).endsWith('Z'))property.setParameter('tzid',defaultZone);
    }
  }
}

export async function parseCoziFeed(source,{now=new Date(),days=90}={}) {
  if(!/^BEGIN:VCALENDAR\s*$/mi.test(source)||!/^END:VCALENDAR\s*$/mi.test(source))throw new Error('Invalid calendar');
  // Cozi can omit VALUE=DATE on all-day fields. Repair only exact date-only values.
  const compatible=source.replace(/^(DTSTART|DTEND|RECURRENCE-ID|RDATE|EXDATE)((?:;[^:\r\n]*)?):(\d{8}(?:,\d{8})*)\r?$/gm,(line,name,parameters,dates)=>/;VALUE=/i.test(parameters)?line:name+parameters+';VALUE=DATE:'+dates);
  const calendar=new ICAL.Component(ICAL.parse(compatible));
  if(calendar.name!=='vcalendar')throw new Error('Invalid calendar');
  timezones(calendar);
  const today=Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(ZONE).toPlainDate();
  const first=today.toZonedDateTime(ZONE).epochMilliseconds;
  const until=today.add({days}).toZonedDateTime(ZONE).epochMilliseconds;
  const groups=new Map();
  for(const component of calendar.getAllSubcomponents('vevent')) {
    const uid=component.getFirstPropertyValue('uid');if(!uid)throw new Error('Missing event identity');
    if(!groups.has(uid))groups.set(uid,new Map());
    const key=String(component.getFirstPropertyValue('recurrence-id')||'master');
    const previous=groups.get(uid).get(key);
    if(!previous||Number(component.getFirstPropertyValue('sequence')||0)>=Number(previous.getFirstPropertyValue('sequence')||0))groups.get(uid).set(key,component);
  }
  if(groups.size>2000)throw new Error('Calendar limit');
  const items=new Map();let steps=0;
  async function include(event,start,end,uid,occurrence) {
    if(cancelled(event))return;
    if(!start||!end)throw new Error('Missing event date');
    const allDay=start.isDate;
    const startAt=allDay?start.toString():start.toJSDate().toISOString();
    const endAt=allDay?end.toString():end.toJSDate().toISOString();
    const startMs=allDay?Temporal.PlainDate.from(startAt).toZonedDateTime(ZONE).epochMilliseconds:Date.parse(startAt);
    const endMs=allDay?Temporal.PlainDate.from(endAt).toZonedDateTime(ZONE).epochMilliseconds:Date.parse(endAt);
    if(endMs<startMs)throw new Error('Invalid event interval');
    if(startMs>=until || (endMs===startMs?endMs<first:endMs<=first))return;
    const id=(await feedDigest(uid))+'-'+occurrence;
    items.set(id,{sortTime:startMs,id,title:text(event.summary)||'Untitled event',start_at:startAt,end_at:endAt,all_day:allDay,timezone:ZONE,location:text(event.location),participants:[...new Set(event.attendees.map(p=>text(p.getParameter('cn'))).filter(Boolean))],categories:event.component.getAllProperties('categories').flatMap(p=>p.getValues()).map(text).filter(Boolean)});
    if(items.size>2000)throw new Error('Calendar limit');
  }
  for(const [uid,components] of groups) {
    const master=components.get('master');
    const exceptions=[...components.entries()].filter(([key])=>key!=='master').map(([,component])=>new ICAL.Event(component,{exceptions:[]}));
    if(exceptions.some(e=>e.modifiesFuture()))throw new Error('Unsupported range exception');
    const overrides=new Set(exceptions.map(e=>e.recurrenceId.toString()));
    const overridesUtc=new Set(exceptions.map(e=>String(e.recurrenceId.toUnixTime())));
    if(master) {
      const event=new ICAL.Event(master,{exceptions:[]});
      if(cancelled(event))continue;
      if(!event.startDate)throw new Error('Missing start');
      if(event.isRecurring()) {
        // Iterate from the true DTSTART: starting at today's date would reset COUNT/BYDAY.
        if(master.hasProperty('rdate')&&!master.hasProperty('rrule'))master.addPropertyWithValue('rdate',event.startDate.clone());
        const iterator=event.iterator();let occurrence;
        while((occurrence=iterator.next())) {
          if(++steps>20000)throw new Error('Recurrence limit');
          if(occurrence.toUnixTime()*1000>=until+86400000)break;
          if(overrides.has(occurrence.toString())||overridesUtc.has(String(occurrence.toUnixTime())))continue;
          const details=event.getOccurrenceDetails(occurrence);
          await include(event,details.startDate,details.endDate,uid,occurrence.toString());
        }
      }else if(!overrides.has(event.startDate.toString()))await include(event,event.startDate,event.endDate,uid,event.startDate.toString());
    }
    // Detached/moved occurrences can enter the window even when their original date is outside it.
    for(const exception of exceptions)if(!cancelled(exception))await include(exception,exception.startDate,exception.endDate,uid,exception.recurrenceId.toString());
  }
  return [...items.values()].sort((a,b)=>a.sortTime-b.sortTime||a.title.localeCompare(b.title)||a.id.localeCompare(b.id)).map(item=>{const result={...item};delete result.sortTime;return result;});
}
