import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client.js';
export function useDirectory() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const sequence = useRef(0);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try { const result = await api('directory'); if (alive.current && current === sequence.current) { setData(result); setError(null); setNow(new Date()); } }
    catch (failure) { if (alive.current && current === sequence.current) setError(failure); }
  }, []);
  useEffect(() => {
    alive.current = true;
    const update = () => { if (!document.hidden) void refresh(); };
    const kickoff = setTimeout(update, 0), interval = setInterval(update, 15000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { alive.current = false; clearTimeout(kickoff); clearInterval(interval); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [refresh]);
  return { data, error, refresh, now };
}
