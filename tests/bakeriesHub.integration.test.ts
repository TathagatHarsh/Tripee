import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '../lib/db';
import { UNDELIVERABLE } from '../lib/orders';
import { loadAreas, loadCoverage, loadPerformance, loadPipeline } from '../lib/bakeriesHubData';

const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
const tag = Date.now();

async function product(suffix: string) {
  const p = await db.cakeProduct.create({ data: { slug: `bh-${suffix}-${tag}`, name: `BH ${suffix} ${tag}`, description: 'x', category: 'chocolate', pricePaise: 100000, sizeBand: '1kg' } });
  await db.cakeVariant.create({ data: { cakeId: p.id, sizeBand: '1kg', eggType: 'eggless', pricePaise: 100000 } });
  return p;
}

async function order(suffix: string, data: Record<string, unknown> = {}) {
  const p = await db.cakeProduct.findFirstOrThrow();
  return db.order.create({ data: { ref: `BH-${tag}-${suffix}`, cakeProductId: p.id, config: { size: '1kg' }, cakeName: 'BH cake', status: 'confirmed', totalPaise: 100000, productSubtotalPaise: 100000, payablePaise: 100000, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.43, longitude: 78.4 }, ...data } });
}

describe.skipIf(!url)('bakeries hub loaders on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it('pipeline puts a ready bakery in ready_for_review', async () => {
    const p = await product('ready');
    const v = await db.vendor.create({ data: { name: `BH ready ${tag}`, isActive: false, locationSetAt: new Date(), detailsConfirmedAt: new Date() } });
    await db.vendorInventory.create({ data: { vendorId: v.id, productId: p.id, productName: p.name, sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
    await db.userProfile.create({ data: { id: `bh-user-${tag}`, vendorId: v.id } });
    const groups = await loadPipeline();
    const ready = groups.find((g) => g.stage === 'ready_for_review');
    expect(ready?.rows.map((r) => r.id)).toContain(v.id);
  });

  it('coverage marks a live bakery’s paused variant as a pause-caused gap', async () => {
    const p = await product('paused');
    const v = await db.vendor.create({ data: { name: `BH live ${tag}`, isAcceptingOrders: true, locationSetAt: new Date() } });
    await db.vendorInventory.create({ data: { vendorId: v.id, productId: p.id, productName: p.name, sizeBand: '1kg', eggType: 'eggless', isAvailable: true, pausedUntil: new Date(Date.now() + 3600_000) } });
    const grid = await loadCoverage();
    const cake = grid.cakes.find((c) => c.productId === p.id);
    expect(cake?.sizes[0].eggless).toMatchObject({ count: 0, gap: true, paused: true });
  });

  it('performance counts offers and acceptance per bakery', async () => {
    const v = await db.vendor.create({ data: { name: `BH perf ${tag}`, isAcceptingOrders: true } });
    const offered = new Date(Date.now() - 3600_000);
    const responded = new Date(offered.getTime() + 5 * 60_000);
    for (const [i, state] of (['ACCEPTED', 'REJECTED'] as const).entries()) {
      const o = await order(`perf-${i}`);
      await db.vendorOrder.create({ data: { orderId: o.id, vendorId: v.id, status: state === 'ACCEPTED' ? 'accepted' : 'rejected', assignmentStatus: state, offeredAt: offered, respondedAt: responded } });
    }
    const rows = await loadPerformance(30);
    expect(rows.find((r) => r.vendorId === v.id)).toMatchObject({ offers: 2, acceptedPct: 50, medianMin: 5 });
  });

  it('areas groups an undeliverable cancellation by its pincode', async () => {
    const pin = `9${String(tag).slice(-5)}`;
    await order('missed', { status: 'cancelled', cancellationReason: UNDELIVERABLE, pincode: pin });
    const { missed, reach } = await loadAreas(30);
    expect(missed.find((a) => a.area === pin)).toMatchObject({ count: 1 });
    expect(Array.isArray(reach)).toBe(true);
  });
});
