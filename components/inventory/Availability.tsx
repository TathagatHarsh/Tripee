'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aBtn, aField } from '@/components/admin/ui';
export function Availability({ vendor }: { vendor: { id: string; isAcceptingOrders: boolean; isBusy: boolean; preparationMinutes: number; maxConcurrentOrders: number } }) {
  const router = useRouter(); const [message, setMessage] = useState(''); const [pending, setPending] = useState(false);
  return <form className="grid gap-4 rounded-xl border border-a-line bg-a-surface p-5 sm:grid-cols-3" onSubmit={async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true);
    try {
      const response = await fetch('/api/vendor/availability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vendorId: vendor.id, availability: data.get('availability'), preparationMinutes: Number(data.get('preparationMinutes')), capacity: Number(data.get('capacity')) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Save failed');
      setMessage('Availability saved.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Connection failed. Retry.'); }
    finally { setPending(false); }
  }}>
    <label className="flex flex-col gap-2">Availability<select className={aField()} name="availability" defaultValue={!vendor.isAcceptingOrders ? 'closed' : vendor.isBusy ? 'busy' : 'accepting'}><option value="accepting">Accepting orders</option><option value="busy">Busy</option><option value="closed">Not accepting orders</option></select></label>
    <label className="flex flex-col gap-2">Preparation time (minutes)<input name="preparationMinutes" type="number" min="1" max="10080" required defaultValue={vendor.preparationMinutes} className={aField()} /></label>
    <label className="flex flex-col gap-2">Maximum active orders<input name="capacity" type="number" min="0" max="10000" required defaultValue={vendor.maxConcurrentOrders} className={aField()} /></label>
    <button disabled={pending} className={aBtn('primary', 'md')}>{pending ? 'Saving…' : 'Save availability'}</button>{message && <p role="status" className="text-sm sm:col-span-2">{message}</p>}
  </form>;
}
