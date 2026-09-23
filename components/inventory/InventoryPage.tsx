import { db } from '@/lib/db';
import { PageHeader } from '@/components/admin/ui';
import { AssignmentRefresh } from '@/components/assignment/Refresh';
import { CakeAvailability } from './CakeAvailability';

export async function InventoryPage({ vendorId, query, admin = false }: { vendorId?: string; query: { q?: string; vendor?: string; stock?: string }; admin?: boolean }) {
  const scope = vendorId ?? query.vendor;
  const [items, variants, vendors] = await Promise.all([
    db.vendorInventory.findMany({ where: scope ? { vendorId: scope } : {}, include: { vendor: { select: { name: true } }, availabilityChanges: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: [{ productName: 'asc' }, { sizeBand: 'asc' }] }),
    db.cakeVariant.findMany({ include: { cake: { select: { name: true } } }, orderBy: { cake: { name: 'asc' } } }),
    admin ? db.vendor.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
  ]);
  return <div className="flex flex-col gap-6">
    <AssignmentRefresh />
    <PageHeader title="Cake Availability" blurb="Tell MakeMyCake which cakes your bakery can currently fulfil." />
    <CakeAvailability key={scope ?? 'all'} vendorId={scope} admin={admin} vendors={vendors} initialQuery={query.q ?? ''} initialFilter={query.stock === 'out' || query.stock === 'attention' ? 'out' : query.stock === 'available' ? 'in' : 'all'} items={items.map(i => ({ id: i.id, vendorId: i.vendorId, vendorName: i.vendor.name, productId: i.productId, productName: i.productName, sizeBand: i.sizeBand, eggType: i.eggType, isAvailable: i.isAvailable, version: i.updatedAt.toISOString(), history: i.availabilityChanges.map(h => ({ id: h.id, previous: h.previousAvailable, next: h.newAvailable, at: h.createdAt.toISOString(), userId: h.userId })) }))} variants={variants.map(v => ({ id: v.id, productId: v.cakeId, productName: v.cake.name, sizeBand: v.sizeBand, eggType: v.eggType }))} />
  </div>;
}
