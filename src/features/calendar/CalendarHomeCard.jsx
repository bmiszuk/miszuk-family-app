import {useCollection} from '../../shared/useCollection.js';
import {upcomingCoziEvents,coziAgenda,coziTimeLabel} from '../../domain/coziCalendar.js';
import {ErrorMessage} from '../../shared/ui/Shared.jsx';
import Icon from '../../shared/ui/Icon.jsx';
export default function CalendarHomeCard() {
 const events=useCollection('cozi-calendar');
 const upcoming=upcomingCoziEvents(events.items || [],new Date(),3);
 return <article className="card summary-card"><Icon name="calendar" /><h3>Next on the calendar</h3>
        <ErrorMessage error={events.error} />
        {!events.error && (events.items === null ? <p>Loading…</p> : upcoming.length ? <div className="home-calendar-groups">{coziAgenda(upcoming).map(group=><div key={group.day}><h4>{group.shortTitle}</h4><ul className="home-calendar-list">{group.items.map(event=><li key={event.id}><strong>{event.title}</strong><span className="muted"> · {coziTimeLabel(event)}</span></li>)}</ul></div>)}</div> : <p>Nothing coming up yet.</p>)}
        <a href="#calendar">Open calendar <span aria-hidden="true">→</span></a>
      </article>;
}
