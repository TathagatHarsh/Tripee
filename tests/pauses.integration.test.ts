import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/auth', () => ({ requireAdmin: async () => ({ userId: 'test-admin', profile: { id: 'test-admin', role: 'ADMIN' } }), getViewer: async () => ({ userId: 'test-admin', profile: { id: 'test-admin', role: 'ADMIN' } }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' })) }));
import { db } from '../lib/db';
import { manualAssignment, respondToAssignment, moveFulfillment, assignmentCandidates } from '../lib/assignment';

const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = Date.now();
// The vendor has neither fulfillsAllProducts nor supportedProductIds: inventory rows are the only gate.
async function fixture() {
  const product = await db.cakeProduct.create({ data: { slug: `pause-${++serial}`, name: 'Pause cake', description: 'Pause', category: 'chocolate', pricePaise: 100000, sizeBand: '1kg' } });
  const vendor = await db.vendor.create({ data: { name: `Pause bakery ${serial}`, locationSetAt: new Date(), isAcceptingOrders: true, fulfillsAllProducts: false, supportedProductIds: [], latitude: 17.43, longitude: 78.4, serviceRadiusKm: 20 } });
  const inventory = await db.vendorInventory.create({ data: { vendorId: vendor.id, productId: product.id, productName: product.name, sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
  const order = await db.order.create({ data: { ref: `PAUSE-${serial}`, cakeProductId: product.id, config: { size: '1kg', eggless: true }, cakeName: product.name, status: 'confirmed', totalPaise: 100000, productSubtotalPaise: 100000, payablePaise: 100000, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.43, longitude: 78.4 }, customerPhone: '+919876543210' } });
  return { vendor, inventory, order };
}
const pause = (id: string, ms: number) => db.vendorInventory.update({ where: { id }, data: { pausedUntil: new Date(Date.now() + ms) } });

describe.skipIf(!url)('cake pauses on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it('assignment skips a paused variant', async () => {
    const f = await fixture();
    await pause(f.inventory.id, 3600000);
    await expect(manualAssignment(f.order.ref, f.vendor.id, null, null)).rejects.toThrow();
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).currentAssignmentId).toBeNull();
  });

  it('is offered again after the pause ends', async () => {
    const f = await fixture();
    await pause(f.inventory.id, -1000);
    await manualAssignment(f.order.ref, f.vendor.id, null, null);
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).currentAssignmentId).not.toBeNull();
  });

  it('has no hidden product gate', async () => {
    const f = await fixture();
    await manualAssignment(f.order.ref, f.vendor.id, null, null);
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).currentAssignmentId).not.toBeNull();
  });

  it('an accepted order continues after the cake is paused', async () => {
    const f = await fixture();
    await manualAssignment(f.order.ref, f.vendor.id, null, null);
    const assignment = (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).currentAssignmentId!;
    await respondToAssignment(f.vendor.id, f.order.ref, assignment, 'ACCEPTED');
    await pause(f.inventory.id, 3600000);
    await moveFulfillment(f.vendor.id, f.order.ref, 'in_preparation', assignment);
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe('in_kitchen');
  });

  it('the candidate list explains a pause', async () => {
    const f = await fixture();
    await pause(f.inventory.id, 3600000);
    const rows = await assignmentCandidates(f.order.ref);
    const row = rows.find((r: { vendorId: string }) => r.vendorId === f.vendor.id) as unknown as { reasons: string[] };
    expect(row.reasons.join(' ')).toContain('unavailable');
  });
});
