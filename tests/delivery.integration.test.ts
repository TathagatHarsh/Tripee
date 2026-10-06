import { afterAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: vi.fn(async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' }))) }));
import { db } from '../lib/db';
import { assignmentCandidates, manualAssignment, moveFulfillment, respondToAssignment } from '../lib/assignment';
import { applyStatusTransition } from '../lib/orderTransition';
import { vendorNext } from '../lib/vendors';
import { isCovered } from '../lib/coverage';

/**
 * One order from confirmed to the customer's door, the way the portals drive it
 * after the order-flow change: the office assigns, the bakery does everything
 * else. Runs only against an isolated database, like assignment.integration.
 */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = 0;

describe.skipIf(!url)('delivery lifecycle on isolated PostgreSQL', () => {
  afterAll(async () => { await db.$disconnect(); });

  async function setup(opts: { pickup?: boolean; located?: boolean; vendorLat?: number } = {}) {
    const tag = `${Date.now()}-${++serial}`;
    const product = await db.cakeProduct.create({ data: { slug: `delivery-test-${tag}`, name: 'Chocolate Truffle', description: 'Test', category: 'chocolate', pricePaise: 189900, sizeBand: '2kg' } });
    const vendor = await db.vendor.create({ data: { name: `Delivery Bakery ${tag}`, isAcceptingOrders: true, fulfillsAllProducts: true, latitude: opts.vendorLat ?? 17.43, longitude: 78.4, serviceRadiusKm: 10 } });
    await db.vendorInventory.create({ data: { vendorId: vendor.id, productId: product.id, productName: product.name, sizeBand: '2kg', eggType: 'eggless', isAvailable: true } });
    const order = await db.order.create({ data: {
      ref: `DLV-${tag}`, cakeProductId: product.id, config: { size: '2kg', eggless: true }, cakeName: 'Chocolate Truffle',
      status: 'confirmed', totalPaise: 189900, productSubtotalPaise: 180000, payablePaise: 189900, priceBreakdown: {},
      deliverySlot: opts.pickup ? 'pickup' : 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000),
      fulfillmentMethod: opts.pickup ? 'pickup' : 'delivery', pincode: '500034',
      deliveryLocation: opts.located === false ? { latitude: null, longitude: null, source: 'manual' } : { latitude: 17.431, longitude: 78.401 },
    } });
    return { vendor, order };
  }

  const status = async (id: string) => (await db.order.findUniqueOrThrow({ where: { id }, include: { currentAssignment: true } }));

  /** Assign, accept and bake: everything up to the cake being ready. */
  async function toReady(ref: string, vendorId: string, id: string) {
    await manualAssignment(ref, vendorId, null);
    const offered = (await status(id)).currentAssignment!;
    expect((await respondToAssignment(vendorId, ref, offered.id, 'ACCEPTED')).ok).toBe(true);
    expect(await moveFulfillment(vendorId, ref, 'in_preparation', offered.id)).toBe(true);
    expect((await status(id)).status).toBe('in_kitchen');
    expect(await moveFulfillment(vendorId, ref, 'ready', offered.id)).toBe(true);
    return offered.id;
  }

  it('a delivery order goes from assignment to delivered, driven by the bakery', async () => {
    const { vendor, order } = await setup();
    const assignmentId = await toReady(order.ref, vendor.id, order.id);

    // What app/vendor/actions does on "Send out for delivery".
    expect(await moveFulfillment(vendor.id, order.ref, 'handed_over', assignmentId)).toBe(true);
    expect(await applyStatusTransition(order.ref, 'out_for_delivery', null)).toBe(true);
    let now = await status(order.id);
    expect(now.status).toBe('out_for_delivery');
    expect(vendorNext(now.currentAssignment!.status, now.status)).toEqual(['delivered']);

    // "Mark delivered".
    expect(await applyStatusTransition(order.ref, 'delivered', null)).toBe(true);
    now = await status(order.id);
    expect(now.status).toBe('delivered');
    expect(vendorNext(now.currentAssignment!.status, now.status)).toEqual([]);

    // The customer heard about both steps, and about nothing the bakery did.
    const kinds = await db.notificationOutbox.findMany({ where: { orderId: order.id, kind: 'status_changed' }, select: { dedupeKey: true } });
    expect(kinds.map((k) => k.dedupeKey).sort()).toEqual([
      `order:${order.id}:status:delivered`,
      `order:${order.id}:status:out_for_delivery`,
    ]);
    // The offer to the bakery is still sent.
    expect(await db.notificationOutbox.count({ where: { orderId: order.id, kind: 'vendor_assigned' } })).toBe(1);
  });

  it('nobody can mark a cake delivered before the bakery hands it over', async () => {
    const { vendor, order } = await setup();
    await toReady(order.ref, vendor.id, order.id);
    expect(await applyStatusTransition(order.ref, 'out_for_delivery', null)).toBe(false);
    expect((await status(order.id)).status).toBe('in_kitchen');
  });

  it('a pickup order runs from ready to collected', async () => {
    const { vendor, order } = await setup({ pickup: true });
    const assignmentId = await toReady(order.ref, vendor.id, order.id);
    expect(await moveFulfillment(vendor.id, order.ref, 'handed_over', assignmentId)).toBe(true);
    expect(await applyStatusTransition(order.ref, 'out_for_delivery', null)).toBe(true);
    expect(await applyStatusTransition(order.ref, 'delivered', null)).toBe(true);
    expect((await status(order.id)).status).toBe('delivered');
  });

  it('an order without map coordinates cannot be assigned to any bakery', async () => {
    const { vendor, order } = await setup({ located: false });
    const candidate = (await assignmentCandidates(order.ref)).find((c) => c.vendorId === vendor.id)!;
    expect(candidate.eligible).toBe(false);
    expect(candidate.reasons).toContain('Verified location required');
  });

  it('checkout coverage sees a nearby bakery and refuses a pin no bakery reaches', async () => {
    await setup();
    expect(await isCovered({ lat: 17.431, lng: 78.401 })).toBe(true);
    // ~70 km from every test bakery (17.43 to 17.68 N, radius at most 20 km).
    expect(await isCovered({ lat: 17.95, lng: 78.95 })).toBe(false);
  });

  it('a pincode inside a delivery zone can still be outside every bakery radius', async () => {
    // 500034 is in the "Hyderabad core" zone checkout accepts; the only bakery
    // sits ~28 km north, beyond its 10 km radius.
    const { vendor, order } = await setup({ vendorLat: 17.68 });
    const candidate = (await assignmentCandidates(order.ref)).find((c) => c.vendorId === vendor.id)!;
    expect(candidate.eligible).toBe(false);
    expect(candidate.reasons).toContain('Outside service area');
  });
});
