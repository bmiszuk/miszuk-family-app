import {useCollection} from './useCollection.js';
import {ErrorMessage,SectionHeader} from './components/Shared.jsx';
import {coziAgenda,coziTimeLabel,COZI_WEB_URL} from './coziCalendar.js';
export default function Calendar() {
 const collection=useCollection('cozi-calendar');
 const groups=coziAgenda(collection.items||[]);
 return <section className="card" id="calendar" aria-label="Calendar">
  <SectionHeader icon="calendar" title="Calendar"/>
  <div className="agenda-toolbar"><span className="muted">Family calendar · Times in Chicago</span><a href={COZI_WEB_URL} target="_blank" rel="noopener noreferrer">Open Cozi ↗</a></div>
  <ErrorMessage error={collection.error}/>
  {!collection.error&&collection.items===null&&<p role="status">Loading calendar…</p>}
  {!collection.error&&collection.items!==null&&!groups.length&&<p className="muted">No upcoming events in the next 90 days.</p>}
  {!collection.error&&collection.items!==null&&groups.map(group=><section className="agenda-group" key={group.title} aria-label={group.title}><h3>{group.title}</h3>
   {<ul className="agenda-list">{group.items.map(event=><li key={event.id}>
    <span className="agenda-time">{coziTimeLabel(event)}</span><div className="agenda-description"><strong>{event.title}</strong>
    {(event.participants?.length>0||event.location)&&<p className="muted">{[event.participants?.join(', '),event.location].filter(Boolean).join(' · ')}</p>}
    {event.categories?.length>0&&<p className="muted">{event.categories.join(' · ')}</p>}
   </div></li>)}</ul>}
  </section>)}
  <p className="sync-note">Updates from Cozi about every 5 minutes. <button className="text-button" onClick={collection.refresh}>Refresh</button></p>
 </section>;
}
