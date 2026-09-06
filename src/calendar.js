export function localDateTime(value = new Date()) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function toUtc(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localDateTime(date) !== value) throw new Error('Choose a valid local date and time.');
  return date.toISOString();
}
export function eventIsPast(event, now = new Date()) {
  if (event.all_day) return (event.end_at || event.start_at) < localDateTime(now).slice(0, 10);
  return new Date(event.end_at || event.start_at).getTime() < now.getTime();
}
export function eventDateLabel(event) {
  const format = value => event.all_day
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', year: 'numeric' });
  return `${format(event.start_at)}${event.end_at && event.end_at !== event.start_at ? ` – ${format(event.end_at)}` : ''}${event.all_day ? ' · All day' : ''}`;
}
