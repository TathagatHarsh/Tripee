'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn } from '@/components/admin/ui';
import { Icon } from '@/components/admin/icons';

type Bakery = { vendorId: string; name: string; eligible: boolean; reasons: string[]; distanceKm: number | null; currentLoad: number; capacity: number };

/**
 * Assign straight from the orders list, without opening the order.
 *
 * Candidates load when the picker opens, not with the page: ranking a bakery
 * calls the distance API, and a list of forty unassigned orders must not cost
 * forty rounds of it just to be looked at. The server ranks them (eligible,
 * not busy, nearest) and the first is marked as the best match.
 *
 * A native popover rather than an absolutely placed panel: the table scrolls
 * sideways, which would clip anything hanging out of a cell, and the top layer
 * is above every overflow. It also brings Escape and click-outside for free.
 *
 * The same POST the order page's AssignVendor makes, so every rule (stock,
 * capacity, deadline, the vendor accepting) is still checked server side.
 */
export function QuickAssign({ orderRef }: { orderRef: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Bakery[] | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const id = `assign-${orderRef}`;

  async function load() {
    setError('');
    try {
      const response = await fetch(`/api/assignments/${encodeURIComponent(orderRef)}?eligible=true`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load bakeries.');
      setRows(body.bakeries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bakeries.');
    }
  }

  async function assign(vendorId: string) {
    setPending(vendorId); setError('');
    try {
      const response = await fetch(`/api/assignments/${encodeURIComponent(orderRef)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'manual', vendorId, expectedAssignmentId: null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Assignment failed.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed. Retry.');
      void load();
    } finally {
      setPending('');
    }
  }

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        onClick={() => { if (!rows) void load(); }}
        className={aBtn('primary', 'sm')}
      >
        Assign
        <Icon name="chevronDown" size={13} />
      </button>
      <div
        id={id}
        popover="auto"
        aria-label={`Assign ${orderRef} to a bakery`}
        className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-a border border-a-line bg-a-surface p-2 text-left text-a-ink shadow-a-card backdrop:bg-black/20"
      >
        <p className="px-2.5 pt-1 pb-2 text-a-small font-semibold">Assign {orderRef}</p>
        {!rows && !error && (
          <div role="status" className="flex flex-col gap-1.5 p-1" aria-label="Loading bakeries">
            {[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-a-sm bg-a-sunken" />)}
          </div>
        )}
        {rows && rows.length === 0 && <p className="p-2 text-a-small text-a-muted">No bakeries are set up yet.</p>}
        {rows && rows.length > 0 && !rows.some((r) => r.eligible) && (
          <p className="mb-1 rounded-a-sm bg-a-warn-wash p-2 text-a-small text-a-warn-ink">
            No bakery can take this order right now.
          </p>
        )}
        {rows && rows.length > 0 && (
          <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {rows.map((row, i) => (
              <li key={row.vendorId}>
                <button
                  type="button"
                  disabled={!row.eligible || !!pending}
                  onClick={() => assign(row.vendorId)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-a-sm px-2.5 py-1.5 text-left transition-colors enabled:hover:bg-a-accent-wash disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-a-small font-semibold text-a-ink">{row.name}</span>
                    <span className="block truncate text-a-meta text-a-muted">
                      {row.eligible
                        ? `${row.distanceKm === null ? 'Distance unknown' : `${row.distanceKm.toFixed(1)} km`}, ${row.currentLoad}/${row.capacity} orders`
                        : row.reasons.join(', ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-a-meta font-medium text-a-accent-ink">
                    {pending === row.vendorId ? 'Assigning…' : row.eligible ? (i === 0 ? 'Best match' : 'Assign') : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="p-2 text-a-small text-a-bad-ink">
            {error} <button type="button" className="underline" onClick={load}>Retry</button>
          </p>
        )}
      </div>
    </>
  );
}
