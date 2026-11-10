'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/icons';
import { AdminOrderPopup, pendingOrderAlerts, type OrderAlert } from './AdminOrderPopup';
type Alert = OrderAlert & { createdAt: string };

/** "Just now", "12 min ago", "3 h ago", then a date. Rendered only after the live feed arrives, so no hydration mismatch. */
function ago(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const trigger = 'flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-a border border-a-line px-3 text-a-small font-medium text-a-ink transition-colors hover:bg-a-sunken [&::-webkit-details-marker]:hidden';
const popover = 'absolute right-0 max-sm:left-0 top-[calc(100%+0.375rem)] z-40 overflow-hidden rounded-a border border-a-line bg-a-surface shadow-a-pop';

export function PortalAlerts({ role, userId }: { role: 'admin' | 'vendor'; userId: string }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const settings = useRef({ enabled: false, volume: 0.4 });
  const bar = useRef<HTMLElement>(null);
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
    } catch { setError('Sound is blocked by the browser. Tap “Test sound” to enable it. Visual alerts still work.'); }
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
  // Close an open dropdown when the user clicks anywhere else.
  useEffect(() => {
    const close = (event: PointerEvent) => bar.current?.querySelectorAll('details[open]').forEach(d => { if (!d.contains(event.target as Node)) d.removeAttribute('open'); });
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  function save(on: boolean, level: number) {
    setEnabled(on); setVolume(level); settings.current = { enabled: on, volume: level };
    try { localStorage.setItem(storageKey, JSON.stringify(settings.current)); } catch { /* In-memory preferences still work. */ }
  }
  async function markAllRead() {
    try { const response = await fetch('/api/portal/notifications', { method: 'POST' }); if (!response.ok) throw new Error(); setAlerts(rows => rows.map(r => ({ ...r, read: true }))); }
    catch { setError('Could not mark notifications as read. Try again.'); }
  }
  const pending = role === 'admin' ? pendingOrderAlerts(alerts, dismissed) : [];
  const active = pending.at(-1);
  const unread = alerts.filter(a => !a.read).length;
  function dismissOrder() {
    if (active) setDismissed(ids => [...ids, ...alerts.filter(row => row.orderRef === active.orderRef).map(row => row.id)]);
  }
  return <section ref={bar} className="mb-5" aria-label="Order alerts">
    {active && <AdminOrderPopup key={active.id} alert={active} count={pending.length} onClose={dismissOrder} onAssigned={name => { setAnnouncement(`${active.orderRef} sent to ${name}. Awaiting vendor acceptance.`); dismissOrder(); }} />}
    <div className="relative flex flex-wrap items-center gap-2 rounded-a border border-a-line bg-a-surface px-3 py-2">
      <span role="status" className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-a-meta font-medium ${connected ? 'border-a-good-line bg-a-good-wash text-a-good-ink' : 'border-a-warn-line bg-a-warn-wash text-a-warn-ink'}`}>
        <span className="relative flex size-2">
          {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-a-good opacity-60 motion-reduce:hidden" />}
          <span className={`relative inline-flex size-2 rounded-full ${connected ? 'bg-a-good' : 'bg-a-warn'}`} />
        </span>
        {connected ? 'Live' : 'Reconnecting…'}
      </span>

      <p role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-a-small text-a-muted">
        {announcement
          ? <span className="font-medium text-a-ink">{announcement}</span>
          : enabled ? 'You’ll hear a chime when a new order update arrives.' : 'Turn on sound so you never miss a new order.'}
      </p>

      <div className="ml-auto flex items-center gap-2">
        <details className="sm:relative">
          <summary className={trigger} aria-label={enabled ? 'Sound alerts on. Open sound settings' : 'Sound alerts off. Open sound settings'}>
            <Icon name={enabled ? 'volume' : 'volumeOff'} size={16} className={enabled ? 'text-a-good-ink' : 'text-a-faint'} />
            <span className="hidden sm:inline">{enabled ? 'Sound on' : 'Sound off'}</span>
          </summary>
          <div className={`${popover} sm:w-64 p-3.5`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-a-small font-medium text-a-ink">Sound alerts</span>
              <button type="button" role="switch" aria-checked={enabled} aria-label="Sound alerts"
                onClick={() => { save(!enabled, volume); if (!enabled) void play(); }}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-a-good' : 'bg-a-line-strong'}`}>
                <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <label className="mt-3 block text-a-meta text-a-muted">Volume
              <input className="mt-1.5 w-full accent-[var(--color-a-accent)]" aria-label="Notification volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => save(enabled, Number(event.target.value))} />
            </label>
            <button type="button" onClick={() => void play()} className="mt-2 text-a-meta font-medium text-a-accent-ink underline-offset-2 hover:underline">Test sound</button>
          </div>
        </details>

        <details className="sm:relative">
          <summary className={trigger} aria-label={`Notifications, ${unread} unread`}>
            <Icon name="bell" size={16} className="text-a-muted" />
            <span className="hidden sm:inline">Notifications</span>
            {unread > 0 && <span className="flex min-w-5 items-center justify-center rounded-full bg-a-accent px-1.5 text-[0.6875rem] font-bold leading-5 text-white">{unread > 99 ? '99+' : unread}</span>}
          </summary>
          <div className={`${popover} sm:w-96`}>
            <div className="flex items-center justify-between border-b border-a-line px-4 py-3">
              <p className="text-a-small font-semibold text-a-ink">Notifications{unread > 0 && <span className="ml-1.5 font-normal text-a-muted">· {unread} new</span>}</p>
              <button type="button" onClick={markAllRead} disabled={!unread} className="text-a-meta font-medium text-a-accent-ink hover:underline disabled:cursor-default disabled:text-a-faint disabled:no-underline">Mark all as read</button>
            </div>
            {alerts.length === 0
              ? <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-a-sunken text-a-faint"><Icon name="bell" size={20} /></span>
                  <p className="mt-3 text-a-small font-medium text-a-ink">You’re all caught up</p>
                  <p className="mt-1 text-a-meta text-a-muted">New orders and status changes will show up here.</p>
                </div>
              : <ul className="max-h-[26rem] overflow-y-auto">{alerts.map(a => {
                  const body = <>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.read ? 'bg-transparent' : 'bg-a-accent'}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-a-small ${a.read ? 'text-a-muted' : 'font-semibold text-a-ink'}`}>{a.title}{!a.read && <span className="sr-only"> (unread)</span>}</span>
                      <span className="mt-0.5 line-clamp-2 block text-a-meta leading-snug text-a-muted">{a.message}</span>
                      <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString('en-IN')} className="mt-1 block text-[0.6875rem] text-a-faint">{ago(a.createdAt)}</time>
                    </span>
                    {a.orderRef && <Icon name="chevronRight" size={14} className="mt-1 shrink-0 text-a-faint" />}
                  </>;
                  const cls = `flex gap-3 border-b border-a-line px-4 py-3 last:border-0 ${a.read ? '' : 'bg-a-accent-wash/40'}`;
                  return <li key={a.id}>{a.orderRef
                    ? <Link href={`/${role}/orders/${a.orderRef}`} onClick={e => e.currentTarget.closest('details')?.removeAttribute('open')} className={`${cls} transition-colors hover:bg-a-sunken`}>{body}</Link>
                    : <div className={cls}>{body}</div>}</li>;
                })}</ul>}
          </div>
        </details>
      </div>
    </div>
    {error && <p role="alert" className="mt-2 flex items-center gap-1.5 text-a-meta text-a-warn-ink"><Icon name="alert" size={14} />{error}</p>}
  </section>;
}
