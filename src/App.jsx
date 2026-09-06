import { useEffect, useState } from 'react';
import './index.css';
import GroceryList from './GroceryList.jsx';
import FamilyNews from './FamilyNews.jsx';
import Calendar from './Calendar.jsx';
import { api } from './client.js';
import Icon from './components/Icon.jsx';
import { ErrorMessage } from './components/Shared.jsx';
export default function App() {
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api('me', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setMember(data.member); setError(null); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure); });
    return () => controller.abort();
  }, [attempt]);
  return <div className="page">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="hero"><div><h1><span className="brand-icon"><Icon name="home" /></span> Miszuk Family</h1><p>Welcome home{member ? `, ${member.name}` : ''}.</p></div>
      {member && <div className="member-info"><span>{member.local ? 'Local preview' : member.email}</span>{!member.local && <a href="/cdn-cgi/access/logout">Sign out</a>}</div>}
    </header>
    {member && <nav className="section-nav" aria-label="Family sections"><a href="#groceries">Grocery List</a><a href="#news">Family News</a><a href="#calendar">Calendar</a></nav>}
    <main id="main">
      {!member ? <section className="card sign-in-panel"><h2>Your family space</h2>{error ? <><ErrorMessage error={error} /><button onClick={() => setAttempt(value => value + 1)}>Try again</button></> : <p role="status">Checking your sign-in…</p>}</section> : <>
        <div className="grid"><GroceryList /><FamilyNews /><Calendar /></div>
        <div className="future-grid" aria-label="Planned family sections">{[
          ['projects', 'House Projects', 'Projects, plans, and things to fix.'], ['photos', 'Photos', 'A place for family memories.'],
          ['recipes', 'Recipes', 'The dishes we come back to.'], ['documents', 'Documents', 'Useful files, all in one place.'],
        ].map(([icon, title, description]) => <section className="future-card" key={title}><h2><Icon name={icon} /> {title}</h2><p>{description}</p><span className="planned">Coming later</span></section>)}</div>
      </>}
    </main>
    <footer>Our home, a little more connected.</footer>
  </div>;
}
