import { useCollection } from './useCollection.js';
import { ErrorMessage } from './components/Shared.jsx';
import Icon from './components/Icon.jsx';
import { eventDateLabel } from './calendar.js';
import { latestNews, nextEvent } from './navigation.js';
import { useDirectory } from './useDirectory.js';
import Celebrations from './Celebrations.jsx';

export default function Home() {
  const directory = useDirectory();
  const groceries = useCollection('groceries');
  const events = useCollection('events');
  const news = useCollection('news');
  const event = nextEvent(events.items || []);
  const post = latestNews(news.items || []);
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
      <article className="card summary-card"><Icon name="news" /><h3>Latest family news</h3>
        <ErrorMessage error={news.error} />
        {!news.error && (news.items === null ? <p>Loading…</p> : post ? <><p className="summary-value summary-clamp">{post.title}</p><p className="muted summary-clamp">{post.body}</p></> : <p>No news yet.</p>)}
        <a href="#news">Read family news <span aria-hidden="true">→</span></a>
      </article>
    </div>
  </section>;
}
