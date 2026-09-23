'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn } from '@/components/admin/ui';
type Alert = { id: string; title: string; message: string; orderRef: string | null; createdAt: string; read: boolean };
export function PortalAlerts({ role, userId }: { role: 'admin' | 'vendor'; userId: string }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const settings = useRef({ enabled: false, volume: 0.4 });
  const storageKey = `mmc-alerts:${userId}`;
  async function play() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (audio.current.state !== 'running') throw new Error('blocked');
      const oscillator = audio.current.createOscillator();
      const gain = audio.current.createGain();
      oscillator.connect(gain); gain.connect(audio.current.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(settings.current.volume * 0.2, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.35);
      oscillator.start(); oscillator.stop(audio.current.currentTime + 0.35);
      setError('');
    } catch { setError('Sound is blocked. Tap Test sound to enable it. Visual alerts remain active.'); }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const next = { enabled: saved.enabled === true, volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 0.4 };
      settings.current = next;
      // Restore browser preferences after hydration.
      queueMicrotask(() => { setEnabled(next.enabled); setVolume(next.volume); });
    } catch { /* Storage may be unavailable in private browsing. */ }
    const source = new EventSource('/api/portal/events');
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = event => {
      const rows: Alert[] = JSON.parse(event.data);
      const fresh = rows.filter(row => !seen.current.has(row.id));
      if (initialized.current && fresh.length) {
        setAnnouncement(fresh[0].message);
        router.refresh();
        if (settings.current.enabled) void play();
      }
      for (const row of rows) seen.current.add(row.id);
      if (seen.current.size > 1000) seen.current = new Set(rows.map(row => row.id));
      initialized.current = true;
      setAlerts(rows); setConnected(true);
    };
    return () => { source.close(); void audio.current?.close(); audio.current = null; };
  }, [router, storageKey]);
  function save(on: boolean, level: number) {
    setEnabled(on); setVolume(level); settings.current = { enabled: on, volume: level };
    try { localStorage.setItem(storageKey, JSON.stringify(settings.current)); } catch { /* In-memory preferences still work. */ }
  }
  return <section className="mb-5 rounded-xl border border-a-line bg-a-surface px-4 py-3" aria-label="Order alerts">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-a-muted" role="status">{connected ? '● Live updates' : '○ Reconnecting… Updates may be delayed.'}</span>
      <details className="ml-auto"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Notifications · {alerts.filter(a => !a.read).length} unread</summary>
        <div className="mt-3 max-h-96 max-w-xl overflow-y-auto">
          <button className={aBtn('quiet', 'sm')} onClick={async () => {
            try { const response = await fetch('/api/portal/notifications', { method: 'POST' }); if (!response.ok) throw new Error(); setAlerts(rows => rows.map(r => ({ ...r, read: true }))); }
            catch { setError('Could not mark notifications as read. Retry.'); }
          }}>Mark all as read</button>
          {!alerts.length && <p className="py-4 text-sm">No notifications yet.</p>}
          <ul className="divide-y divide-a-line">{alerts.map(a => <li key={a.id} className={`py-3 text-sm ${a.read ? 'text-a-muted' : 'font-semibold'}`}><p>{!a.read && '● '}{a.title}</p>{a.orderRef ? <Link className="underline" href={`/${role}/orders/${a.orderRef}`}>{a.message}</Link> : <p>{a.message}</p>}<p className="mt-1 text-xs font-normal">{new Date(a.createdAt).toLocaleString('en-IN')}</p></li>)}</ul>
        </div>
      </details>
      <button className={aBtn('secondary', 'sm')} onClick={() => { save(!enabled, volume); if (!enabled) void play(); }}>{enabled ? 'Sound ON' : 'Enable sound alerts'}</button>
      <details><summary className="min-h-11 cursor-pointer py-2 text-sm">Sound settings</summary><label className="flex items-center gap-2 py-2">Volume<input aria-label="Notification volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => save(enabled, Number(event.target.value))} /></label><button className={aBtn('quiet', 'sm')} onClick={() => void play()}>Test sound</button></details>
    </div>
    {!enabled && <p className="text-xs text-a-muted">Turn on sound notifications so you never miss a new order.</p>}
    <p role="status" aria-live="polite" className={announcement ? 'mt-2 rounded-lg bg-a-accent-wash p-3 text-sm font-semibold' : 'sr-only'}>{announcement}</p>
    {error && <p role="alert" className="mt-2 text-sm text-a-warn-ink">{error}</p>}
  </section>;
}
