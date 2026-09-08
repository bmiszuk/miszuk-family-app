import { displayNames } from './familyDisplay.js';
import { celebrations } from './directoryDates.js';
export default function Celebrations({ directory, compact = false }) {
  if (!directory.data) return null;
  const names = displayNames(directory.data.people);
  const people = compact ? directory.data.people.map(person => ({...person, first_name: names.get(person.id)})) : directory.data.people;
  const dates = celebrations(people, directory.data.relationships, directory.now);
  const today = dates.filter(date => date.days === 0);
  const upcoming = dates.filter(date => date.days > 0);
  if (!dates.length) return compact ? null : <p className="muted">No birthdays or anniversaries in the next 30 days.</p>;
  const label = date => <>{date.days === 0 ? `Today is ${date.name}’s ${date.type}!` : `${date.name}’s ${date.type} is ${date.when}.`}{date.age !== undefined && <span className="muted"> Turning {date.age}.</span>}</>;
  return <section className="celebrations" aria-label="Family birthdays and anniversaries">
    <h2>Family dates</h2>
    {today.map(date => <p className="celebration-today" key={date.id}>{label(date)}</p>)}
    {!!upcoming.length && <><h3>Coming up · next 30 days</h3><ul>{upcoming.slice(0, compact ? 5 : undefined).map(date => <li key={date.id}>{label(date)}</li>)}</ul></>}
    {compact && <a href="#directory">{upcoming.length > 5 ? 'See all family dates' : 'Open directory'} <span aria-hidden="true">→</span></a>}
  </section>;
}
