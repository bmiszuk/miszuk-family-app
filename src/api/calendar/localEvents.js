import {HttpError,stringField} from '../shared/errors.js';
import {boolField} from '../shared/recordValues.js';
import {handleRecords} from '../shared/records.js';
function calendarValue(value, allDay, label) {
  if (typeof value !== 'string') throw new HttpError(400, `${label} is required.`);
  const pattern = allDay ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const parsed = new Date(allDay ? `${value}T00:00:00.000Z` : value);
  if (!pattern.test(value) || !Number.isFinite(parsed.getTime()) || (allDay ? parsed.toISOString().slice(0, 10) : parsed.toISOString()) !== value) {
    throw new HttpError(400, `${label} must be a valid ${allDay ? 'date' : 'UTC date and time'}.`);
  }
  return value;
}


// Retained legacy local calendar API; the current UI reads Cozi instead.
export function handleLocalEvents(request,env,member,id) {
 return handleRecords(request,env,member,id,{
  table:'household_events',order:'start_at ASC, id ASC',fields:['title','start_at','end_at','all_day','timezone','location','notes'],authorName:true,
  values(body) {
      const allDay = boolField(body.all_day, 'All day');
      const start = calendarValue(body.start_at, allDay, 'Start');
      const end = body.end_at ? calendarValue(body.end_at, allDay, 'End') : null;
      if (end && (end < start || (!allDay && end === start))) throw new HttpError(400, 'End must be after the start.');
      const timezone = stringField(body.timezone, 'Time zone', 100);
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
      catch { throw new HttpError(400, 'Choose a valid time zone.'); }
      return [stringField(body.title, 'Title', 160), start, end, allDay, timezone,
        stringField(body.location, 'Location', 240, false), stringField(body.notes, 'Notes', 5000, false)];
  },
  normalizeUpdate(merged,current,body) {if(!Object.hasOwn(body,'all_day')) merged.all_day=Boolean(current.all_day);}
 });
}
