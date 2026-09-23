import 'server-only';
import type { Prisma } from '@prisma/client';
import { variantNeeds } from './inventoryRules';
type Tx = Prisma.TransactionClient;
export class InventoryConflict extends Error {}
export async function inventoryForOrder(tx: Tx, vendorId: string, order: Parameters<typeof variantNeeds>[0]) {
  let needs;
  try { needs = variantNeeds(order); } catch (error) { throw new InventoryConflict((error as Error).message); }
  const items = await tx.vendorInventory.findMany({ where: { vendorId, OR: needs } });
  return needs.map(need => ({ need, item: items.find(i => i.productId === need.productId && i.sizeBand === need.sizeBand && i.eggType === need.eggType) }));
}
// The caller holds the assignment lock, shared with availability edits.
export async function requireOrderAvailability(tx: Tx, vendorId: string, order: Parameters<typeof variantNeeds>[0]) {
  const inventory = await inventoryForOrder(tx, vendorId, order);
  if (!inventory.length || inventory.some(({ item }) => !item?.isAvailable))
    throw new InventoryConflict('A required cake variant is unavailable at this bakery.');
}
export async function recordAvailability(tx: Tx, inventoryId: string, previousAvailable: boolean | null, newAvailable: boolean, userId: string) {
  if (previousAvailable === newAvailable) return;
  await tx.inventoryAvailabilityChange.create({ data: { inventoryId, previousAvailable, newAvailable, userId } });
}
