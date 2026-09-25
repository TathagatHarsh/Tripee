import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db, hasDatabase, NO_DATABASE_MESSAGE } from '@/lib/db';
import { formatINR, formatIST } from '@/lib/format';
import { PageHeader, StatCard, Card, CardHead, EmptyState, Notice, aBtn } from '@/components/admin/ui';
export default async function Dashboard() {
  await requireAdmin();
  if (!hasDatabase()) return <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>;
  const [orders, inventory, vendors, responses] = await Promise.all([
    db.order.findMany({ where: { status: { in: ['draft', 'confirmed', 'in_kitchen', 'out_for_delivery'] } }, include: { currentAssignment: { include: { vendor: { select: { name: true } } } }, cakes: { select: { cakeName: true, variantLabel: true } } }, orderBy: { dueAt: 'asc' } }),
    db.vendorInventory.findMany({ include: { vendor: { select: { name: true } } } }),
    db.vendor.findMany({ where: { isActive: true }, include: { assignments: { where: { currentFor: { status: { in: ['confirmed', 'in_kitchen'] } }, status: { in: ['assigned', 'accepted', 'in_preparation', 'ready'] } } }, inventory: true }, orderBy: { name: 'asc' } }),
    db.vendorOrder.findMany({ where: { respondedAt: { not: null } }, orderBy: { respondedAt: 'desc' }, take: 6, include: { vendor: { select: { name: true } }, order: { select: { ref: true } } } }),
  ]);
  const unassigned = orders.filter(o => ['confirmed', 'in_kitchen'].includes(o.status) && !o.currentAssignmentId);
  const waiting = orders.filter(o => o.currentAssignment?.status === 'assigned');
  const preparing = orders.filter(o => o.currentAssignment?.status === 'in_preparation');
  const ready = orders.filter(o => o.currentAssignment?.status === 'ready');
  const unavailable = inventory.filter(i => !i.isAvailable);
  const cards = [
    { label: 'New orders', value: orders.filter(o => o.status === 'draft').length, query: 'status=draft' },
    { label: 'Awaiting assignment', value: unassigned.length, query: 'production=unassigned' },
    { label: 'Awaiting vendor', value: waiting.length, query: 'production=assigned' },
    { label: 'In preparation', value: preparing.length, query: 'production=in_preparation' },
    { label: 'Ready', value: ready.length, query: 'production=ready' },
    { label: 'Delivering', value: orders.filter(o => o.status === 'out_for_delivery').length, query: 'status=out_for_delivery' },
  ];
  return <div className="flex flex-col gap-6">
    <PageHeader title="Every order. The right bakery." blurb="Your operations control center. Start with what needs attention."><Link href="/admin/orders" className={aBtn('primary', 'md')}>All orders</Link></PageHeader>
    <section className="ops-overview-band"><div><span className="text-xs uppercase tracking-widest">MakeYourCakes · Operations</span><h2>Keep every promise.</h2><p>{unassigned.length ? `${unassigned.length} orders need a bakery. Check cake availability, choose a vendor, and keep production moving.` : 'Every confirmed order has a bakery. Watch responses and keep cake availability up to date.'}</p></div><div className="ops-overview-figures"><Link href="/admin/inventory"><strong>{unavailable.length}</strong><span>Unavailable cake variants ↗</span></Link><Link href="/admin/vendors"><strong>{vendors.filter(v => v.isAcceptingOrders && !v.isBusy && v.assignments.length < v.maxConcurrentOrders && (!v.unavailableUntil || v.unavailableUntil <= new Date())).length}</strong><span>Available bakeries ↗</span></Link></div></section>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">{cards.map(c => <StatCard key={c.label} label={c.label} value={String(c.value)} href={`/admin/orders?${c.query}`} />)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <Card><CardHead title="Needs assignment" note="Cake availability and capacity are checked again when you assign." />
        {!unassigned.length ? <EmptyState icon="check" title="All caught up" blurb="New orders needing a bakery will appear here." /> : <ul className="divide-y divide-a-line">{unassigned.slice(0, 15).map(o => <li key={o.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><Link className="font-a-mono text-sm font-semibold" href={`/admin/orders/${o.ref}`}>{o.ref}</Link><h3 className="mt-1 font-semibold">{o.cakes[0]?.cakeName ?? o.cakeName ?? 'Cake order'}{o.cakes.length > 1 ? ` + ${o.cakes.length - 1} cakes` : ''}</h3><p className="text-sm text-a-muted">{o.customerName} · {formatINR(o.totalPaise)}</p><p className="mt-1 text-xs text-a-muted">{o.requestedFor ? formatIST(o.requestedFor) : 'Delivery time to confirm'} · {o.requestedWindow ?? o.deliverySlot}</p></div><Link className={aBtn('primary', 'md')} href={`/admin/orders/${o.ref}`}>Assign vendor</Link></li>)}</ul>}
      </Card>
      <div className="flex flex-col gap-5"><Card><CardHead title="Vendor responses" note="Latest acceptance and rejection activity" /><ul className="divide-y divide-a-line">{responses.map(r => <li key={r.id} className="py-3"><Link href={`/admin/orders/${r.order.ref}`} className="text-sm font-semibold">{r.order.ref} · {r.vendor.name}</Link><p className="mt-1 text-sm">{r.rejectedAt ? '✕ Rejected' : '✓ Accepted'}{r.rejectionReason ? ` — ${r.rejectionReason}` : ''}</p><p className="text-xs text-a-muted">{r.respondedAt && formatIST(r.respondedAt)}</p></li>)}{!responses.length && <li className="py-4 text-sm text-a-muted">Responses will appear when vendors accept or reject requests.</li>}</ul></Card>
      <Card><CardHead title="Unavailable cake variants"><Link href="/admin/inventory" className="text-sm underline">View Cake Availability</Link></CardHead><ul className="divide-y divide-a-line">{unavailable.slice(0, 8).map(i => <li key={i.id} className="py-3 text-sm"><Link href={`/admin/inventory?vendor=${i.vendorId}`} className="font-semibold">✕ Unavailable · {i.productName}</Link><p className="text-a-muted">{i.vendor.name} · {i.sizeBand} · {i.eggType}</p></li>)}{!unavailable.length && <li className="py-4 text-sm">No unavailable cake variants recorded.</li>}</ul></Card></div>
    </div>
    <Card><CardHead title="Bakery availability" note="Bakery status, capacity and cake availability in one place" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{vendors.map(v => <Link key={v.id} href={`/admin/vendors/${v.id}`} className="rounded-xl border border-a-line p-4"><h3 className="font-semibold">{v.name}</h3><p className="mt-2 text-sm">{!v.isAcceptingOrders ? '○ Not accepting orders' : v.isBusy || v.assignments.length >= v.maxConcurrentOrders ? '◷ Busy' : '✓ Accepting orders'}</p><p className="mt-1 text-sm text-a-muted">{v.assignments.length}/{v.maxConcurrentOrders} active orders · {v.inventory.filter(i => i.isAvailable).length} available · {v.inventory.filter(i => !i.isAvailable).length} unavailable cake variants</p></Link>)}</div>{!vendors.length && <EmptyState icon="vendor" title="No active bakeries" blurb="Add a bakery partner and its cake availability to start assigning." />}</Card>
  </div>;
}
