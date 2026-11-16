import "server-only";
import { db } from "./db";
import { istDayStart } from "./needsYou";
import { UNDELIVERABLE } from "./orders";
import { vendorSetupStates } from "./vendorInvite";
import { bakeryStats, coverageGrid, missedAreas, pipelineGroups, type CoverageCake } from "./bakeriesHub";

/** The bakeries hub's queries. One loader per tab, so a tab never pays for another's data. */

const DAY_MS = 86_400_000;
const LIVE = { isActive: true, isAcceptingOrders: true } as const;

export async function loadPipeline(now = new Date()) {
  const [vendors, states, today] = await Promise.all([
    db.vendor.findMany({ select: { id: true, name: true, phone: true, inviteExpiresAt: true }, orderBy: { name: "asc" } }),
    vendorSetupStates(),
    db.vendorOrder.groupBy({ by: ["vendorId"], where: { assignmentStatus: "ACCEPTED", assignedAt: { gte: istDayStart(now) } }, _count: { _all: true } }),
  ]);
  const available = await db.vendorInventory.groupBy({ by: ["vendorId"], where: { isAvailable: true }, _count: { _all: true } });
  const avail = new Map(available.map((r) => [r.vendorId, r._count._all]));
  const todayBy = new Map(today.map((r) => [r.vendorId, r._count._all]));
  return pipelineGroups(
    vendors.flatMap((v) => {
      const s = states.get(v.id);
      if (!s) return [];
      return [{ ...v, stage: s.stage, steps: s.steps, availableVariants: avail.get(v.id) ?? 0, ordersToday: todayBy.get(v.id) ?? 0 }];
    }),
    now,
  );
}

export async function loadCoverage(now = new Date()) {
  const [variants, rows] = await Promise.all([
    db.cakeVariant.findMany({ where: { isAvailable: true, cake: { isAvailable: true } }, select: { cakeId: true, sizeBand: true, eggType: true, cake: { select: { name: true } } } }),
    db.vendorInventory.findMany({ where: { vendor: LIVE }, select: { productId: true, sizeBand: true, eggType: true, isAvailable: true, pausedUntil: true, vendor: { select: { name: true } } } }),
  ]);
  const cakes = new Map<string, CoverageCake>();
  for (const v of variants) {
    const c = cakes.get(v.cakeId) ?? { productId: v.cakeId, name: v.cake.name, variants: [] };
    c.variants.push({ sizeBand: v.sizeBand, eggType: v.eggType });
    cakes.set(v.cakeId, c);
  }
  return coverageGrid(
    [...cakes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    rows.map((r) => ({ vendorName: r.vendor.name, productId: r.productId, sizeBand: r.sizeBand, eggType: r.eggType, isAvailable: r.isAvailable, pausedUntil: r.pausedUntil })),
    now,
  );
}

export async function loadPerformance(days: 7 | 30 | 90, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const [rows, vendors] = await Promise.all([
    db.vendorOrder.findMany({
      where: { offeredAt: { gte: since } },
      select: {
        vendorId: true, assignmentStatus: true, offeredAt: true, respondedAt: true, handedOverAt: true,
        vendor: { select: { name: true } }, order: { select: { dueAt: true, requestedFor: true } },
      },
    }),
    db.vendor.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  return bakeryStats(
    rows.map((r) => ({
      vendorId: r.vendorId, vendorName: r.vendor.name, state: r.assignmentStatus, offeredAt: r.offeredAt,
      respondedAt: r.respondedAt, handedOverAt: r.handedOverAt, due: r.order.dueAt ?? r.order.requestedFor,
    })),
    vendors,
  );
}

export async function loadAreas(days: 7 | 30 | 90, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const [orders, live] = await Promise.all([
    db.order.findMany({ where: { status: "cancelled", cancellationReason: UNDELIVERABLE, createdAt: { gte: since } }, select: { pincode: true, deliveryLocation: true, createdAt: true } }),
    db.vendor.findMany({ where: LIVE, select: { name: true, latitude: true, longitude: true, serviceRadiusKm: true, address: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    missed: missedAreas(orders.map((o) => ({ pincode: o.pincode, location: o.deliveryLocation, createdAt: o.createdAt })), live),
    reach: live.map((b) => ({ name: b.name, address: b.address, radiusKm: b.serviceRadiusKm })),
  };
}
