import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { db } from '@/lib/db';
import { crossSite } from '@/lib/apiGuard';
import { lockAssignments } from '@/lib/assignment';
import { recordAvailability, InventoryConflict } from '@/lib/inventory';
const Id = z.string().trim().min(1).max(200);
const Availability = z.union([
  z.object({ vendorId: Id, id: Id, isAvailable: z.boolean() }).strict(),
  z.object({ vendorId: Id, variantIds: z.array(Id).min(1).max(500) }).strict(),
]);
export async function POST(req: Request) {
  if (crossSite(req)) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer || !['ADMIN', 'VENDOR'].includes(viewer.profile.role)) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const parsed = Availability.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Choose cake variants or a valid availability setting.' }, { status: 400 });
  const input = parsed.data;
  if (viewer.profile.role === 'VENDOR' && viewer.profile.vendorId !== input.vendorId) return Response.json({ error: 'Not authorised' }, { status: 403 });
  try {
    await db.$transaction(async tx => {
      await lockAssignments(tx);
      const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
      if (!vendor || viewer.profile.role === 'VENDOR' && !vendor.isActive) throw new InventoryConflict('Bakery is unavailable.');
      if ('id' in input) {
        const before = await tx.vendorInventory.findFirst({ where: { id: input.id, vendorId: input.vendorId } });
        if (!before) throw new InventoryConflict('Inventory item not found.');
        if (before.isAvailable !== input.isAvailable) {
          await tx.vendorInventory.update({ where: { id: before.id }, data: { isAvailable: input.isAvailable } });
          await recordAvailability(tx, before.id, before.isAvailable, input.isAvailable, viewer.userId);
        }
      } else {
        const ids = [...new Set(input.variantIds)];
        const variants = await tx.cakeVariant.findMany({ where: { id: { in: ids } }, include: { cake: { select: { name: true } } } });
        if (variants.length !== ids.length) throw new InventoryConflict('Choose valid cake variants.');
        for (const variant of variants) {
          const key = { vendorId: input.vendorId, productId: variant.cakeId, sizeBand: variant.sizeBand, eggType: variant.eggType };
          const existing = await tx.vendorInventory.findUnique({ where: { vendorId_productId_sizeBand_eggType: key } });
          // Retried adds preserve an existing toggle, including unavailable.
          if (existing) continue;
          const item = await tx.vendorInventory.create({ data: { ...key, productName: variant.cake.name, isAvailable: true } });
          await recordAvailability(tx, item.id, null, true, viewer.userId);
        }
      }
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof InventoryConflict) return Response.json({ error: error.message }, { status: 409 });
    console.error('inventory_update_failed', error);
    return Response.json({ error: 'Availability could not be saved. Retry.' }, { status: 500 });
  }
}
