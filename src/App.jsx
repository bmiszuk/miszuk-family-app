import { useEffect, useState } from 'react';
import './index.css';
import Home from './Home.jsx';
import { sections, sectionFromHash } from './navigation.js';
import GroceryList from './GroceryList.jsx';
import FamilyNews from './FamilyNews.jsx';
import Calendar from './Calendar.jsx';
import { api } from './client.js';
import Icon from './components/Icon.jsx';
import { ErrorMessage } from './components/Shared.jsx';
export default function App() {
  const [section, setSection] = useState(() => sectionFromHash(window.location.hash));
  useEffect(() => {
    const onHash = () => { if (window.location.hash !== '#main') setSection(sectionFromHash(window.location.hash)); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [section]);
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
    {member && <nav className="section-nav app-nav" aria-label="Family sections">{sections.map(item => <a key={item.id} href={`#${item.id}`} aria-current={section === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span></a>)}</nav>}
    <main id="main" tabIndex={-1}>
      {!member ? <section className="card sign-in-panel"><h2>Your family space</h2>{error ? <><ErrorMessage error={error} /><button onClick={() => setAttempt(value => value + 1)}>Try again</button></> : <p role="status">Checking your sign-in…</p>}</section> : <>
        {section === 'home' && <Home />}
        <div className="section-view" hidden={section !== 'groceries'}><GroceryList /></div>
        <div className="section-view" hidden={section !== 'calendar'}><Calendar /></div>
        <div className="section-view" hidden={section !== 'news'}><FamilyNews /></div>
      </>}
    </main>
    <footer>Our home, a little more connected.</footer>
  </div>;
}
