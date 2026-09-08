import FamilyNotices from './FamilyNotices.jsx';
import { useCollection } from './useCollection.js';
import { ErrorMessage } from './components/Shared.jsx';
import Icon from './components/Icon.jsx';
import { eventDateLabel } from './calendar.js';
import { nextEvent } from './navigation.js';
import { useDirectory } from './useDirectory.js';
import Celebrations from './Celebrations.jsx';

export default function Home() {
  const directory = useDirectory();
  const groceries = useCollection('groceries');
  const events = useCollection('events');
  const news = useCollection('news');
  const event = nextEvent(events.items || []);
  const count = (groceries.items || []).filter(item => !item.done).length;
  return <section className="home-view" aria-label="Home">
    <h2>A little closer to home</h2>
    <p className="muted home-intro">Your family’s day, at a glance.</p>
    <ErrorMessage error={directory.error} />
    <Celebrations directory={directory} compact />
    <div className="home-grid">
      <article className="card summary-card"><Icon name="groceries" /><h3>Groceries</h3>
        <ErrorMessage error={groceries.error} />
        {!groceries.error && <p className="summary-value">{groceries.items === null ? 'Loading…' : `${count} ${count === 1 ? 'item' : 'items'} to pick up`}</p>}
        <a href="#groceries">Open grocery list <span aria-hidden="true">→</span></a>
      </article>
      <article className="card summary-card"><Icon name="calendar" /><h3>Next on the calendar</h3>
        <ErrorMessage error={events.error} />
        {!events.error && (events.items === null ? <p>Loading…</p> : event ? <><p className="summary-value summary-clamp">{event.title}</p><p className="muted">{eventDateLabel(event)}</p></> : <p>Nothing coming up yet.</p>)}
        <a href="#calendar">Open calendar <span aria-hidden="true">→</span></a>
      </article>
      <FamilyNotices collection={news} people={directory.data?.people || []} />
    </div>
  </section>;
}
