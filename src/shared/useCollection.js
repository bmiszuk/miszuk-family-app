import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client.js';
export function useCollection(resource) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const sequence = useRef(0);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const data = await api(resource);
      if (alive.current && current === sequence.current) { setItems(data.items); setError(null); }
    } catch (failure) { if (alive.current && current === sequence.current) setError(failure); }
  }, [resource]);
  useEffect(() => {
    alive.current = true;
    const kickoff = setTimeout(refresh, 0);
    const onFocus = () => { if (!document.hidden) void refresh(); };
    const interval = setInterval(onFocus, 15000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      alive.current = false;
      clearTimeout(kickoff);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);
  return { items, error, refresh };
}
export function useAction(refresh, noticeDuration = 0) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    if (!notice || !noticeDuration || busy) return;
    const timer = setTimeout(() => setNotice(''), noticeDuration);
    return () => clearTimeout(timer);
  }, [notice, noticeDuration, busy]);
  async function run(action, message = 'Saved.') {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(null); setNotice('');
    try {
      await action(); setNotice(message);
      await refresh(); // Refresh catches its own errors; a committed write stays successful.
      return true;
    } catch (failure) {
      setError(failure);
      if (failure.status === 409) await refresh();
      return false;
    } finally { locked.current = false; setBusy(false); }
  }
  return { busy, error, notice, run };
}
