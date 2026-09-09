import {householdTitle} from './familyDisplay.js';
import Dinner from './Dinner.jsx';
import FamilyNotices from './FamilyNotices.jsx';
import {useState} from 'react';
import {api} from './client.js';
import { useCollection, useAction } from './useCollection.js';
import { ErrorMessage } from './components/Shared.jsx';
import Icon from './components/Icon.jsx';
import {upcomingCoziEvents,coziAgenda,coziTimeLabel} from './coziCalendar.js';
import { useDirectory } from './useDirectory.js';
import Celebrations from './Celebrations.jsx';

export default function Home({member}) {
  const directory = useDirectory();
  const groceries = useCollection('groceries');
  const events = useCollection('cozi-calendar');
  const news = useCollection('news');
  const upcoming = upcomingCoziEvents(events.items || [],new Date(),3);
  const [name,setName]=useState('');
  const action=useAction(groceries.refresh);
  async function quickAdd(event) {
    event.preventDefault();
    if(await action.run(()=>api('groceries',{method:'POST',body:{name:name.trim(),requester_person_id:member.person?.id||null}}),'Item added.')) setName('');
  }
  const count = (groceries.items || []).filter(item => !item.done).length;
  return <section className="home-view" aria-label="Home">
    <div className="home-grid">
      <article className="card summary-card"><Icon name="groceries" /><h3>{householdTitle(member.household?.name, 'Groceries')}</h3>
        <ErrorMessage error={groceries.error} />
        {!groceries.error && <p className="summary-value">{groceries.items === null ? 'Loading…' : `${count} ${count === 1 ? 'item' : 'items'} to pick up`}</p>}
        <form className="home-quick-add" onSubmit={quickAdd}><input aria-label="Grocery item name" placeholder="Add an item…" value={name} onChange={event=>setName(event.target.value)} maxLength={160} required disabled={action.busy}/><button type="submit" aria-label="Add grocery item" disabled={action.busy||!name.trim()}>+</button></form>
        <ErrorMessage error={action.error}/><p className="save-status" role="status">{action.notice}</p>
        <a href="#groceries">Open grocery list <span aria-hidden="true">→</span></a>
      </article>
      <Dinner member={member} compact />
      <article className="card summary-card"><Icon name="calendar" /><h3>Next on the calendar</h3>
        <ErrorMessage error={events.error} />
        {!events.error && (events.items === null ? <p>Loading…</p> : upcoming.length ? <div className="home-calendar-groups">{coziAgenda(upcoming).map(group=><div key={group.day}><h4>{group.shortTitle}</h4><ul className="home-calendar-list">{group.items.map(event=><li key={event.id}><strong>{event.title}</strong><span className="muted"> · {coziTimeLabel(event)}</span></li>)}</ul></div>)}</div> : <p>Nothing coming up yet.</p>)}
        <a href="#calendar">Open calendar <span aria-hidden="true">→</span></a>
      </article>
      <FamilyNotices currentPersonId={member.person?.id} collection={news} people={directory.data?.people || []} />
    </div>
    <ErrorMessage error={directory.error} />
    <Celebrations directory={directory} compact />
  </section>;
}
