const chicago = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
export function chicagoDate(now = new Date()) {
  const parts = Object.fromEntries(chicago.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
// A date without a year is MM-DD. Full dates remain compatible with birth_date.
export function parseFamilyDate(value) {
  if (typeof value !== 'string' || !/^(?:\d{4}-)?\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split('-').map(Number);
  const [year, month, day] = parts.length === 3 ? parts : [null, ...parts];
  if (year !== null && (year < 1000 || year > 9999)) return null;
  const date = new Date(Date.UTC(year || 2000, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}
export function familyDateLabel(value) {
  const parts = parseFamilyDate(value);
  if (!parts) return 'Not entered';
  return new Date(Date.UTC(parts.year || 2000, parts.month - 1, parts.day)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', ...(parts.year ? { year: 'numeric' } : {}) });
}
export function celebrations(people, relationships, now = new Date(), horizon = 30) {
  const today = chicagoDate(now);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  const thisYear = Number(today.slice(0, 4));
  const byId = new Map(people.map(person => [person.id, person]));
  const entries = people.map(person => ({ id: `birthday-${person.id}`, type: 'birthday', name: person.first_name, date: person.birth_date }));
  for (const relationship of relationships) {
    const a = byId.get(relationship.person1_id), b = byId.get(relationship.person2_id);
    if (relationship.relationship_type === 'spouse' && a && b && relationship.anniversary_date) {
      entries.push({ id: `anniversary-${relationship.id}`, type: 'anniversary', name: `${a.first_name} & ${b.first_name}`, date: relationship.anniversary_date });
    }
  }
  return entries.flatMap(entry => {
    const parts = parseFamilyDate(entry.date);
    if (!parts) return [];
    // Feb 29 is observed on Feb 28 in non-leap years.
    const occurrence = year => {
      const maxDay = new Date(Date.UTC(year, parts.month, 0)).getUTCDate();
      return Date.UTC(year, parts.month - 1, Math.min(parts.day, maxDay));
    };
    let year = thisYear, time = occurrence(year);
    if (time < todayTime) time = occurrence(++year);
    const days = Math.round((time - todayTime) / 86400000);
    if (days > horizon || (parts.year && year < parts.year)) return [];
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 7
      ? new Date(time).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' })
      : new Date(time).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
    return [{ ...entry, days, when, ...(entry.type === 'birthday' && parts.year ? { age: year - parts.year } : {}) }];
  }).sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}
