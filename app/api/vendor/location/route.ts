import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { db } from '@/lib/db';
import { crossSite } from '@/lib/apiGuard';
import { lockAssignments } from '@/lib/assignment';
import { parseRadiusKm, RADIUS_KM } from '@/lib/assignmentRules';
import { portalEvent } from '@/lib/portalNotifications';

const Input = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number(),
  address: z.string().trim().max(300).optional(),
});

/**
 * A bakery places its own pin and picks how far it delivers. The only writer of
 * `locationSetAt`, which is what lets a bakery be offered orders at all
 * (lib/assignmentRules' vendorEligible). Bakery only: the admin can correct the
 * pin afterwards from /admin/vendors, but that never counts as the bakery's own.
 */
export async function POST(req: Request) {
  if (crossSite(req)) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const viewer = await getViewer();
  const vendorId = viewer?.profile.role === 'VENDOR' ? viewer.profile.vendorId : null;
  if (!vendorId) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const input = Input.safeParse(await req.json().catch(() => null));
  const radiusKm = input.success ? parseRadiusKm(input.data.radiusKm) : null;
  if (!input.success || radiusKm === null)
    return Response.json({ error: `Place the pin on your bakery and choose ${RADIUS_KM.min} to ${RADIUS_KM.max} km.` }, { status: 400 });
  const { lat, lng, address } = input.data;
  const saved = await db.$transaction(async (tx) => {
    await lockAssignments(tx);
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor?.isActive) return false;
    const result = await tx.vendor.update({
      where: { id: vendorId },
      data: { latitude: lat, longitude: lng, serviceRadiusKm: radiusKm, locationSetAt: new Date(), ...(address ? { address } : {}) },
    });
    await portalEvent(tx, { key: `location:${vendorId}:${result.updatedAt.toISOString()}`, vendorId, title: 'Bakery location set', message: `${vendor.name}: delivers up to ${radiusKm} km` });
    return true;
  });
  return saved ? Response.json({ ok: true }) : Response.json({ error: 'Bakery unavailable' }, { status: 409 });
}
