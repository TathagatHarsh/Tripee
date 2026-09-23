import { requireVendor } from '@/lib/auth';
import { db } from '@/lib/db';
import { Availability } from '@/components/inventory/Availability';
import { PageHeader } from '@/components/admin/ui';
export default async function Profile() {
  const { vendor } = await requireVendor();
  const active = await db.vendorOrder.count({ where: { vendorId: vendor.id, currentFor: { status: { in: ['confirmed', 'in_kitchen'] } }, status: { in: ['assigned', 'accepted', 'in_preparation', 'ready'] } } });
  return <div className="space-y-5"><PageHeader title={vendor.name} blurb="Your bakery’s availability and production capacity." /><p>{active} active orders · {Math.max(0, vendor.maxConcurrentOrders - active)} remaining capacity</p><Availability key={vendor.updatedAt.toISOString()} vendor={vendor} /></div>;
}
