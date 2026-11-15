import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { db } from '@/lib/db';
import { crossSite } from '@/lib/apiGuard';
import { lockAssignments } from '@/lib/assignment';
import { portalEvent } from '@/lib/portalNotifications';
import { RADIUS_KM } from '@/lib/assignmentRules';
// The details group (prep time, capacity, radius) is all-or-nothing: the status switch posts availability alone.
const Input = z.object({ vendorId: z.string().optional(), availability: z.enum(['accepting', 'busy', 'closed']), preparationMinutes: z.number().int().min(1).max(10080).optional(), capacity: z.number().int().min(0).max(10000).optional(), radiusKm: z.number().min(RADIUS_KM.min).max(RADIUS_KM.max).optional() })
  .refine(d => (d.preparationMinutes === undefined) === (d.capacity === undefined) && (d.capacity === undefined) === (d.radiusKm === undefined), { message: 'details' });
export async function POST(req: Request) {
  if (crossSite(req)) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer || !['ADMIN', 'VENDOR'].includes(viewer.profile.role)) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const input = Input.safeParse(await req.json().catch(() => null));
  if (!input.success) return Response.json({ error: 'Check availability, preparation time, capacity and radius.' }, { status: 400 });
  const vendorId = viewer.profile.role === 'ADMIN' ? input.data.vendorId : viewer.profile.vendorId;
  if (!vendorId) return Response.json({ error: 'No bakery selected' }, { status: 400 });
  const details = input.data.preparationMinutes !== undefined;
  const saved = await db.$transaction(async tx => {
    await lockAssignments(tx);
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) return 'missing' as const;
    // Unapproved bakeries finish setup but cannot open for orders yet.
    if (!vendor.isActive && input.data.availability !== 'closed') return 'unapproved' as const;
    const result = await tx.vendor.update({ where: { id: vendorId }, data: { unavailableUntil: null, isAcceptingOrders: input.data.availability !== 'closed', isBusy: input.data.availability === 'busy', ...(details && { preparationMinutes: input.data.preparationMinutes, maxConcurrentOrders: input.data.capacity }), ...(input.data.radiusKm !== undefined && { serviceRadiusKm: input.data.radiusKm }), ...(details && viewer.profile.role === 'VENDOR' && { detailsConfirmedAt: new Date() }) } });
    await portalEvent(tx, { key: `availability:${result.id}:${result.updatedAt.toISOString()}`, vendorId, title: 'Bakery availability changed', message: `${vendor.name}: ${input.data.availability}` });
    return 'saved' as const;
  });
  if (saved === 'unapproved') return Response.json({ error: 'Available once MakeYourCakes approves your bakery' }, { status: 409 });
  return saved === 'saved' ? Response.json({ ok: true }) : Response.json({ error: 'Bakery unavailable' }, { status: 409 });
}
