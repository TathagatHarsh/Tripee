'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn, aField, aLabel } from '@/components/admin/ui';

type V = { id: string; isActive: boolean; isAcceptingOrders: boolean; isBusy: boolean; preparationMinutes: number; maxConcurrentOrders: number; serviceRadiusKm: number };

/** Prep time, radius and capacity. Sends the current availability too, so the route's one body shape stays valid. */
export function DetailsForm({ vendor }: { vendor: V }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const current = !vendor.isAcceptingOrders || !vendor.isActive ? 'closed' : vendor.isBusy ? 'busy' : 'accepting';

  return (
    <form id="details" className="scroll-mt-20 rounded-a border border-a-line bg-a-surface p-4 shadow-a-card sm:p-5" onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setPending(true); setMessage('');
      try {
        const res = await fetch('/api/vendor/availability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vendorId: vendor.id, availability: current, preparationMinutes: Number(data.get('preparationMinutes')), capacity: Number(data.get('capacity')), radiusKm: Number(data.get('radiusKm')) }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Save failed. Try again.');
        setMessage('Saved.'); router.refresh();
      } catch (e) { setMessage(e instanceof Error ? e.message : 'Connection failed. Try again.'); }
      finally { setPending(false); }
    }}>
      <h2 className="font-a-sans text-a-item font-semibold text-a-ink">Kitchen details</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <label className={`${aLabel} flex flex-col gap-2`}>Prep time (minutes)<input name="preparationMinutes" type="number" inputMode="numeric" min="1" max="10080" required defaultValue={vendor.preparationMinutes} className={aField('min-h-11')} /></label>
        <label className={`${aLabel} flex flex-col gap-2`}>Delivery radius (km)<input name="radiusKm" type="number" inputMode="decimal" min="1" max="50" step="any" required defaultValue={vendor.serviceRadiusKm} className={aField('min-h-11')} /></label>
        <label className={`${aLabel} flex flex-col gap-2`}>Max orders at once<input name="capacity" type="number" inputMode="numeric" min="0" max="10000" required defaultValue={vendor.maxConcurrentOrders} className={aField('min-h-11')} /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={pending} className={aBtn('primary', 'md', 'min-h-11')}>{pending ? 'Saving…' : 'Save details'}</button>
        {message && <p role="status" className="text-a-small text-a-muted">{message}</p>}
      </div>
    </form>
  );
}
