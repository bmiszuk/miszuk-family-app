import {householdTitle} from './familyDisplay.js';
import Dinner from './Dinner.jsx';
import FamilyNotices from './FamilyNotices.jsx';
import { useCollection } from './useCollection.js';
import { ErrorMessage } from './components/Shared.jsx';
import Icon from './components/Icon.jsx';
import {upcomingCoziEvents,coziDateLabel} from './coziCalendar.js';
import { useDirectory } from './useDirectory.js';
import Celebrations from './Celebrations.jsx';

export default function Home({member}) {
  const directory = useDirectory();
  const groceries = useCollection('groceries');
  const events = useCollection('cozi-calendar');
  const news = useCollection('news');
  const upcoming = upcomingCoziEvents(events.items || [],new Date(),3);
  const count = (groceries.items || []).filter(item => !item.done).length;
  return <section className="home-view" aria-label="Home">
    <Dinner member={member} compact />
    <ErrorMessage error={directory.error} />
    <Celebrations directory={directory} compact />
    <div className="home-grid">
      <article className="card summary-card"><Icon name="groceries" /><h3>{householdTitle(member.household?.name, 'Groceries')}</h3>
        <ErrorMessage error={groceries.error} />
        {!groceries.error && <p className="summary-value">{groceries.items === null ? 'Loading…' : `${count} ${count === 1 ? 'item' : 'items'} to pick up`}</p>}
        <a href="#groceries">Open grocery list <span aria-hidden="true">→</span></a>
      </article>
      <article className="card summary-card"><Icon name="calendar" /><h3>Next on the calendar</h3>
        <ErrorMessage error={events.error} />
        {!events.error && (events.items === null ? <p>Loading…</p> : upcoming.length ? <ul className="home-calendar-list">{upcoming.map(event=><li key={event.id}><strong>{event.title}</strong><span className="muted">{coziDateLabel(event)}</span></li>)}</ul> : <p>Nothing coming up yet.</p>)}
        <a href="#calendar">Open calendar <span aria-hidden="true">→</span></a>
      </article>
      <FamilyNotices currentPersonId={member.person?.id} collection={news} people={directory.data?.people || []} />
    </div>
  </section>;
}
