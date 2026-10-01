import {useEffect, useState} from 'react';
import {api} from '../../shared/client.js';
import {browserStatus, canEnroll, registerWorker, deviceMarker, detachDevice, enrollDevice} from './browser.js';
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
    const [config, devices, preferences] = await Promise.all([api('notifications/config'), api('notifications/subscriptions'), api('notifications/preferences')]);
    setState({config, devices: devices.items, preferences});
  };
  useEffect(() => {
    let live = true;
    Promise.all([api('notifications/config'), api('notifications/subscriptions'), registerWorker(), api('notifications/preferences')]).then(([config, devices, worker, preferences]) => {
      if (live) { setState({config, devices: devices.items, preferences}); setRegistration(worker); }
    }).catch(() => { if (live) setMessage('Unable to load notification settings. Try again later.'); });
    return () => { live = false; };
  }, []);
  async function perform(action, success = 'Notification settings updated.') {
    setBusy(true); setMessage('');
    try { await action(); await load(); setMessage(success); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const marker = deviceMarker();
  const own = marker?.userId === member.account.id && state?.devices.find(item => item.id === marker.id && item.enabled);
  const sendTest = id => perform(async () => {
    const result = await api('notifications/test', {method: 'POST', body: {subscription_id: id}});
    if (result.result !== 'accepted') throw new Error('Test was not accepted. Try again later.');
  }, 'Test accepted by the push service. Check the selected device; acceptance does not confirm delivery.');
  return <section className="card"><h2>Notifications</h2><p>{browserStatus()}</p>
    {state && <><p>{state.config.enrollment_allowed ? (own ? 'Enabled on this device.' : 'Disabled on this device.') : 'Notifications are not available yet. Enrollment and test sending remain off.'}</p>
      <div className="actions"><button disabled={busy || Boolean(own) || !canEnroll() || !registration || !state.config.enrollment_allowed} onClick={() => perform(() => enrollDevice(member.account.id, state.config, registration))}>Enable on this device</button>
        {marker && <button disabled={busy} onClick={() => perform(() => detachDevice(member.account.id))}>Disable on this device</button>}
        <button disabled={busy || !own || !state.config.sending_allowed} onClick={() => sendTest(own.id)}>Send test</button></div>
      <p>{state.devices.length} registered device{state.devices.length === 1 ? '' : 's'}.</p>
      {state.config.sending_allowed && state.devices.length > 0 && <><h3>Your devices</h3><p className="muted">To test a locked phone, send to it from another browser signed in as you. Wait one minute between tests.</p><ul>{state.devices.map(device => <li key={device.id}>{device.device_label || 'Browser device'}{device.id === own?.id ? ' · this device' : ''} <button disabled={busy || !device.enabled} onClick={() => sendTest(device.id)}>Send test to {device.device_label || 'device'}</button></li>)}</ul></>}
      <fieldset><legend>Notification categories</legend>
        {[['birthdays','Birthdays'],['chat','Family Chat'],['polls','Polls']].map(([key,label])=><label className="notification-choice" key={key}><input type="checkbox" checked={state.preferences.categories[key]} disabled={busy} onChange={event=>{const enabled=event.target.checked;perform(()=>api('notifications/preferences',{method:'PATCH',body:{version:state.preferences.version,categories:{...state.preferences.categories,[key]:enabled}}}));}} />{label}</label>)}
      </fieldset><p className="muted">These choices apply to all your enrolled devices. Birthdays arrive at 8:00 AM Chicago time. Birthday/Chat notifications show first names, never Chat message text. Poll notifications never include the question.</p></>}
    {message && <p role="status">{message}</p>}<a href="#home">Back to Home</a>
  </section>;
}
