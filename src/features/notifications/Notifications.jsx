import {useEffect, useState} from 'react';
import {api} from '../../shared/client.js';
import {browserStatus, registerWorker, deviceMarker, detachDevice, enrollDevice} from './browser.js';
import './notifications.css';
export function SignOut({userId}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const leave = () => { window.location.assign('/cdn-cgi/access/logout'); };
  async function signOut() {
    setBusy(true); setError('');
    try { await detachDevice(userId); leave(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <span className="notification-signout"><button className="link-button" disabled={busy} onClick={signOut}>Sign out</button>{error && <span role="alert">{error} <button onClick={leave}>Continue sign out</button></span>}</span>;
}
export default function Notifications({member}) {
  const [state, setState] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [config, devices] = await Promise.all([api('notifications/config'), api('notifications/subscriptions')]);
    setState({config, devices: devices.items});
  };
  useEffect(() => {
    let live = true;
    Promise.all([api('notifications/config'), api('notifications/subscriptions'), registerWorker()]).then(([config, devices, worker]) => {
      if (live) { setState({config, devices: devices.items}); setRegistration(worker); }
    }).catch(() => { if (live) setMessage('Unable to load notification settings. Try again later.'); });
    return () => { live = false; };
  }, []);
  async function perform(action) {
    setBusy(true); setMessage('');
    try { await action(); await load(); setMessage('Notification settings updated.'); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const marker = deviceMarker();
  const own = marker?.userId === member.account.id && state?.devices.find(item => item.id === marker.id && item.enabled);
  return <section className="card"><h2>Notifications</h2><p>{browserStatus()}</p>
    {state && <><p>{state.config.enrollment_allowed ? (own ? 'Enabled on this device.' : 'Disabled on this device.') : 'Notifications are not available yet. Enrollment and test sending remain off.'}</p>
      <div className="actions"><button disabled={busy || !registration || !state.config.enrollment_allowed} onClick={() => perform(() => enrollDevice(member.account.id, state.config, registration))}>Enable on this device</button>
        {marker && <button disabled={busy} onClick={() => perform(() => detachDevice(member.account.id))}>Disable on this device</button>}
        <button disabled={busy || !own || !state.config.sending_allowed} onClick={() => perform(async () => { const result = await api('notifications/test', {method: 'POST', body: {subscription_id: own.id}}); if (result.result !== 'accepted') throw new Error('Test was not accepted. Try again later.'); })}>Send test</button></div>
      <p>{state.devices.length} registered device{state.devices.length === 1 ? '' : 's'}.</p>
      <p className="muted">Chat, polls, Dinner, Calendar, family dates and Vehicles notifications are future options and default off.</p></>}
    {message && <p role="status">{message}</p>}<a href="#home">Back to Home</a>
  </section>;
}
