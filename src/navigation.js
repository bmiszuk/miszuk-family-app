import { eventIsPast } from './calendar.js';

export const sections = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'groceries', label: 'Groceries', icon: 'groceries' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'news', label: 'News', icon: 'news' },
  { id: 'directory', label: 'Directory', icon: 'directory' },
];
export function sectionFromHash(hash) {
  const id = hash.replace(/^#/, '');
  return sections.some(section => section.id === id) ? id : 'home';
}
export function nextEvent(events, now = new Date()) {
  const start = event => new Date(event.all_day ? `${event.start_at}T00:00:00` : event.start_at).getTime();
  return events.filter(event => !eventIsPast(event, now)).sort((a, b) => start(a) - start(b))[0];
}
export function latestNews(posts) {
  return [...posts].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
