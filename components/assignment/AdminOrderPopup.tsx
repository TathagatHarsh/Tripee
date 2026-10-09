'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AssignVendor } from '@/app/admin/orders/[ref]/AssignVendor';
import { Icon } from '@/components/admin/icons';
import { aBtn } from '@/components/admin/ui';

export type OrderAlert = {
  id: string; title: string; message: string; orderRef: string | null; read: boolean;
  order?: { ref: string; status?: string; customerName: string | null; cakeName: string | null; totalPaise: number; addressLine1: string | null; city: string | null; cakes: { cakeName: string | null }[] } | null;
};

export function pendingOrderAlerts<T extends OrderAlert>(alerts: T[], dismissed: string[]) {
  const refs = new Set<string>();
  return alerts.filter(alert => {
    if (!alert.order || alert.read || dismissed.includes(alert.id) || refs.has(alert.order.ref)) return false;
    refs.add(alert.order.ref);
    return true;
  });
}

export function AdminOrderPopup({ alert, count, onClose, onAssigned }: { alert: OrderAlert; count: number; onClose: () => void; onAssigned: (name: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const order = alert.order!;
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="incoming-order-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-lg border border-a-line bg-a-surface p-0 text-a-ink shadow-xl backdrop:bg-black/40">
    <header className="flex items-center justify-between gap-3 border-b border-a-line px-5 py-4">
      <div className="flex items-center gap-3"><Icon name="bell" size={22} /><h2 id="incoming-order-title" className="text-lg font-semibold">{alert.title === 'rejected' ? 'Vendor rejected order' : 'Order needs assignment'}</h2></div>
      <button type="button" aria-label="Dismiss order alert" title="Dismiss order alert" className={aBtn('quiet', 'md')} onClick={onClose}><Icon name="close" size={18} /></button>
    </header>
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap justify-between gap-2"><strong className="text-xl">{order.ref}</strong><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(order.totalPaise / 100)}</strong></div>
      <div><p className="font-semibold">{order.cakes.length ? order.cakes.map(cake => cake.cakeName ?? 'Custom cake').join(', ') : order.cakeName ?? 'Custom cake'}</p><p className="mt-1 text-sm text-a-muted">{[order.customerName, order.addressLine1, order.city].filter(Boolean).join(' · ')}</p></div>
      {alert.title === 'rejected' && <p className="rounded-lg bg-a-warn-wash p-3 text-sm text-a-warn-ink">{alert.message}</p>}
      {order.status === 'draft' ? <Link className={aBtn('primary', 'lg', 'w-full')} href={`/admin/orders/${encodeURIComponent(order.ref)}`} onClick={onClose}>Review & confirm order<Icon name="arrowRight" size={18} /></Link> : reviewing ? <AssignVendor orderRef={order.ref} assigned={null} assignmentId={null} vendors={[]} onAssigned={onAssigned} /> : <button type="button" className={aBtn('primary', 'lg', 'w-full')} onClick={() => setReviewing(true)}>Review & assign vendor<Icon name="arrowRight" size={18} /></button>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-a-line pt-3 text-sm"><Link className="underline" href={`/admin/orders/${encodeURIComponent(order.ref)}`} onClick={onClose}>Full order details</Link><span className="text-a-muted">{count} {count === 1 ? 'order needs' : 'orders need'} attention</span></footer>
    </div>
  </dialog>;
}
