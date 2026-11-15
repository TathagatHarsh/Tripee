import 'server-only';
import type { Prisma } from '@prisma/client';
import { isOfferable, variantNeeds } from './inventoryRules';
import { pauseEnd, type PauseLength } from './onboarding';
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
  if (!inventory.length || inventory.some(({ item }) => !isOfferable(item)))
    throw new InventoryConflict('A required cake variant is unavailable at this bakery.');
}
// A pause or resume is logged even though availability stays put, so pausedUntil counts as a change.
export async function recordAvailability(tx: Tx, inventoryId: string, previousAvailable: boolean | null, newAvailable: boolean, userId: string, pausedUntil: Date | null = null, previousPausedUntil: Date | null = null) {
  if (previousAvailable === newAvailable && pausedUntil?.getTime() === previousPausedUntil?.getTime()) return;
  await tx.inventoryAvailabilityChange.create({ data: { inventoryId, previousAvailable, newAvailable, userId, ...(pausedUntil || previousPausedUntil ? { pausedUntil } : {}) } });
}

// Changes whenever any of the bakery's rows is written, so a stale screen can be refused.
export async function gridVersion(vendorId: string, tx: Tx) {
  const { _max } = await tx.vendorInventory.aggregate({ where: { vendorId }, _max: { updatedAt: true } });
  return _max.updatedAt?.toISOString() ?? null;
}

export type GridRow = { productId: string; sizes: string[]; egg: boolean; eggless: boolean };

export async function saveCakeGrid(tx: Tx, vendorId: string, grid: GridRow[], version: string | null, userId: string) {
  if (version !== await gridVersion(vendorId, tx)) throw new InventoryConflict('This changed on another device. Reload to see the latest.');
  const productIds = [...new Set(grid.map(g => g.productId))];
  const variants = await tx.cakeVariant.findMany({ where: { cakeId: { in: productIds } }, include: { cake: { select: { name: true } } } });
  const wanted = new Set<string>();
  for (const g of grid) for (const v of variants) {
    if (v.cakeId === g.productId && g.sizes.includes(v.sizeBand) && (v.eggType === 'egg' ? g.egg : g.eggless)) wanted.add(v.id);
  }
  const existing = await tx.vendorInventory.findMany({ where: { vendorId, productId: { in: productIds } } });
  const key = (r: { productId: string; sizeBand: string; eggType: string }) => `${r.productId}|${r.sizeBand}|${r.eggType}`;
  const have = new Map(existing.map(r => [key(r), r]));
  const keep = new Set<string>();
  for (const v of variants) {
    if (!wanted.has(v.id)) continue;
    const k = { productId: v.cakeId, sizeBand: v.sizeBand, eggType: v.eggType };
    keep.add(key(k));
    const row = have.get(key(k));
    if (!row) {
      const item = await tx.vendorInventory.create({ data: { vendorId, ...k, productName: v.cake.name, isAvailable: true } });
      await recordAvailability(tx, item.id, null, true, userId);
    } else if (!row.isAvailable) {
      await tx.vendorInventory.update({ where: { id: row.id }, data: { isAvailable: true } });
      await recordAvailability(tx, row.id, false, true, userId);
    }
  }
  for (const row of existing) {
    if (keep.has(key(row)) || !row.isAvailable) continue;
    await tx.vendorInventory.update({ where: { id: row.id }, data: { isAvailable: false } });
    await recordAvailability(tx, row.id, true, false, userId);
  }
  return gridVersion(vendorId, tx);
}

export type PauseScope = { productId: string } | { sizeBand: string } | { eggType: 'eggless' };

// A bad or past date makes pauseEnd throw a RangeError; the route turns it into a 400.
export async function pauseVariants(tx: Tx, vendorId: string, scope: PauseScope, length: PauseLength, userId: string, now = new Date()) {
  const until = pauseEnd(length, now);
  const rows = await tx.vendorInventory.findMany({ where: { vendorId, isAvailable: true, ...scope } });
  for (const row of rows) {
    await tx.vendorInventory.update({ where: { id: row.id }, data: { pausedUntil: until } });
    await recordAvailability(tx, row.id, true, true, userId, until, row.pausedUntil);
  }
  return gridVersion(vendorId, tx);
}

export async function resumeVariants(tx: Tx, vendorId: string, ids: string[], userId: string) {
  const rows = await tx.vendorInventory.findMany({ where: { vendorId, id: { in: ids }, pausedUntil: { not: null } } });
  for (const row of rows) {
    await tx.vendorInventory.update({ where: { id: row.id }, data: { pausedUntil: null } });
    await recordAvailability(tx, row.id, row.isAvailable, row.isAvailable, userId, null, row.pausedUntil);
  }
  return gridVersion(vendorId, tx);
}
