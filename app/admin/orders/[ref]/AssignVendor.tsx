'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn } from '@/components/admin/ui';
type Candidate = { vendorId: string; name: string; eligible: boolean; reasons: string[]; distanceKm: number | null; estimatedMinutes: number | null; source: string; preparationMinutes: number; capacity: number; currentLoad: number; inventory: { product: string; isAvailable: boolean }[] };
export function AssignVendor({ orderRef, assigned, assignmentId }: { orderRef: string; assigned: string | null; assignmentId: string | null; vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(!assigned);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let fetching = false;
    async function refresh() {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch(`/api/assignments/${encodeURIComponent(orderRef)}?eligible=true`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load bakeries.');
        if (!controller.signal.aborted) { setRows(body.bakeries); setError(''); }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load bakeries.');
      } finally {
        fetching = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [orderRef, open, version]);
  if (!open) return <button className={aBtn('secondary', 'md')} onClick={() => setOpen(true)}>Reassign vendor</button>;
  return <section className="flex flex-col gap-3" aria-label="Assign vendor">
    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">{assigned ? 'Reassign order' : 'Assign order'}</h3><button className={aBtn('quiet', 'sm')} disabled={!!pending} onClick={() => { setLoading(true); setVersion(v => v + 1); }}>Refresh candidates</button></div>
    <p className="text-sm text-a-muted">Choose an eligible bakery. Cake availability is checked again when assigning; the vendor must accept.</p>
    {loading ? <div role="status" className="animate-pulse rounded-xl bg-a-canvas p-6">Checking cake availability, capacity and preparation time…</div> : <>
      {!rows.some(r => r.eligible) && <p className="rounded-lg bg-a-warn-wash p-4 text-sm">No bakery can fulfil this order now. Check cake availability, bakery capacity and delivery time.</p>}
      {[true, false].map(eligible => <section key={String(eligible)} className="flex flex-col gap-3" aria-label={eligible ? 'Eligible bakeries' : 'Unavailable bakeries'}>
        <h4 className="font-semibold">{eligible ? 'Eligible bakeries' : 'Unavailable bakeries'} · {rows.filter(row => row.eligible === eligible).length}</h4>
        {rows.filter(row => row.eligible === eligible).map(row => <article key={row.vendorId} className={`rounded-xl border p-4 ${row.eligible ? 'border-a-accent-line bg-a-accent-wash' : 'border-a-line bg-a-canvas'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold">{row.name}</h5><span className="text-xs font-semibold">{row.eligible ? '✓ Eligible' : '✕ Unavailable'}</span></div>
        <p className="mt-1 text-sm text-a-muted">{row.source === 'pickup' ? 'Pickup / route not ranked' : row.source === 'unknown' || row.distanceKm === null ? 'Location unavailable' : `${row.distanceKm.toFixed(1)} km${row.source === 'haversine_estimate' ? ' approximate' : ''}`} · Preparation {row.preparationMinutes} min · Capacity {row.currentLoad}/{row.capacity}</p>
        <ul className="my-3 text-sm">{row.inventory.map(item => <li key={item.product}>{item.product} · <strong>{item.isAvailable ? 'Available' : 'Unavailable'}</strong></li>)}</ul>
        {row.reasons.length > 0 && <p className="text-sm text-a-warn-ink">{row.reasons.join(' · ')}</p>}
        {row.eligible && <button className={aBtn('primary', 'md', 'mt-2')} disabled={!!pending || !!error} onClick={async () => {
          setPending(row.vendorId); setError('');
          try {
            const response = await fetch(`/api/assignments/${encodeURIComponent(orderRef)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'manual', vendorId: row.vendorId, expectedAssignmentId: assignmentId }) });
            const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Assignment failed.');
            router.refresh(); setOpen(false);
          } catch (error) { setError(error instanceof Error ? error.message : 'Connection failed. Retry.'); setVersion(v => v + 1); }
          finally { setPending(''); }
        }}>{pending === row.vendorId ? 'Assigning…' : `Assign ${row.name}`}</button>}
      </article>)}
      </section>)}
    </>}
    {error && <p role="alert" className="text-sm text-a-bad-ink">{error} <button className="underline" onClick={() => setVersion(v => v + 1)}>Retry</button></p>}
    {assigned && <button className={aBtn('quiet', 'md')} onClick={() => setOpen(false)}>Keep {assigned}</button>}
  </section>;
}
