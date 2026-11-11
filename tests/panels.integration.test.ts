import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/auth', () => ({ requireAdmin: async () => ({ userId: 'test-admin', profile: { id: 'test-admin', role: 'ADMIN' } }), getViewer: async () => ({ userId: 'test-admin', profile: { id: 'test-admin', role: 'ADMIN' } }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' })) }));
import { db } from '../lib/db';
import { manualAssignment, respondToAssignment, moveFulfillment } from '../lib/assignment';
import { handOver, vendorDeliveryMove } from '../lib/vendorTransition';
import { vendorBoard, vendorHistory, vendorOrder } from '../app/vendor/data';
import { VENDOR_COLUMNS, VENDOR_SENT_OUT_COLUMN, vendorNext } from '../lib/vendors';
import { setVendorActive } from '../app/admin/actions';

/* Regression tests for the 2026-11-10 admin/vendor audit (docs/ADMIN-VENDOR-AUDIT-2026-11-10.md). */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = Date.now();
async function fixture() {
  const product = await db.cakeProduct.create({ data: { slug: `panel-${++serial}`, name: 'Panel cake', description: 'Panel', category: 'chocolate', pricePaise: 100000, sizeBand: '1kg' } });
  const vendor = await db.vendor.create({ data: { name: `Panel bakery ${serial}`, locationSetAt: new Date(), isAcceptingOrders: true, fulfillsAllProducts: true, latitude: 17.43, longitude: 78.4, serviceRadiusKm: 20 } });
  await db.vendorInventory.create({ data: { vendorId: vendor.id, productId: product.id, productName: product.name, sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
  const order = await db.order.create({ data: { ref: `PANELS-${serial}`, cakeProductId: product.id, config: { size: '1kg', eggless: true }, cakeName: product.name, status: 'confirmed', totalPaise: 100000, productSubtotalPaise: 100000, payablePaise: 100000, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.43, longitude: 78.4 }, customerPhone: '+919876543210' } });
  await manualAssignment(order.ref, vendor.id, null, null);
  const assignment = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).currentAssignmentId!;
  await respondToAssignment(vendor.id, order.ref, assignment, 'ACCEPTED');
  return { vendor, order, assignment };
}

describe.skipIf(!url)('admin and vendor panels on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it('a sent-out order has a board column and the delivered move', async () => {
    const f = await fixture();
    await moveFulfillment(f.vendor.id, f.order.ref, 'in_preparation', f.assignment);
    await moveFulfillment(f.vendor.id, f.order.ref, 'ready', f.assignment);
    await handOver(f.vendor.id, f.order.ref, f.assignment, null);
    const board = await vendorBoard(f.vendor.id);
    expect(board).toHaveLength(1);
    expect(vendorNext(board[0].status, board[0].order.status)).toEqual(['delivered']);
    expect([...VENDOR_COLUMNS, VENDOR_SENT_OUT_COLUMN].filter((col) => col.status === board[0].status)).toHaveLength(1);
  });

  it('accepting clears the pending-response note', async () => {
    const f = await fixture();
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).assignmentNote).toBeNull();
  });

  it('vendor preparation sends the customer nothing (only confirmed, out for delivery and delivered do)', async () => {
    const f = await fixture();
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-no-network'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'test';
    try {
      await moveFulfillment(f.vendor.id, f.order.ref, 'in_preparation', f.assignment);
      expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe('in_kitchen');
      expect(await db.notificationOutbox.count({ where: { orderId: f.order.id, dedupeKey: { contains: ':in_kitchen:customer' } } })).toBe(0);
      expect(await db.notificationOutbox.count({ where: { orderId: f.order.id, dedupeKey: `order:${f.order.id}:status:in_kitchen` } })).toBe(1);
    } finally {
      delete process.env.WHATSAPP_ACCESS_TOKEN; delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
  });

  it('the customer gets a WhatsApp update when the bakery marks it delivered', async () => {
    const f = await fixture();
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-no-network'; process.env.WHATSAPP_PHONE_NUMBER_ID = 'test';
    try {
      await moveFulfillment(f.vendor.id, f.order.ref, 'in_preparation', f.assignment);
      await moveFulfillment(f.vendor.id, f.order.ref, 'ready', f.assignment);
      await handOver(f.vendor.id, f.order.ref, f.assignment, null);
      expect(await vendorDeliveryMove(f.vendor.id, f.order.ref, f.assignment, 'delivered', null)).toBe(true);
      const sent = await db.notificationOutbox.findMany({ where: { orderId: f.order.id, dedupeKey: { contains: ':customer' } }, select: { dedupeKey: true } });
      expect(sent.map((s) => /:(\w+):customer/.exec(s.dedupeKey)?.[1]).sort()).toEqual(['delivered', 'out_for_delivery']);
    } finally {
      delete process.env.WHATSAPP_ACCESS_TOKEN; delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
  });

  it('refuses to deactivate a bakery holding an accepted order', async () => {
    const f = await fixture();
    await moveFulfillment(f.vendor.id, f.order.ref, 'in_preparation', f.assignment);
    const form = new FormData(); form.set('id', f.vendor.id); form.set('isActive', 'false');
    const result = await setVendorActive(undefined, form);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(f.order.ref);
    expect((await db.vendor.findUniqueOrThrow({ where: { id: f.vendor.id } })).isActive).toBe(true);
  });

  it('history finds an order older than the newest page, and pages', async () => {
    const f = await fixture();
    for (let i = 0; i < 60; i++) {
      const newer = await db.order.create({ data: { ref: `HISTORY-${++serial}`, config: {}, priceBreakdown: {}, totalPaise: 100, payablePaise: 100, deliverySlot: 'standard', leadHours: 24, status: 'delivered' } });
      await db.vendorOrder.create({ data: { vendorId: f.vendor.id, orderId: newer.id, sequence: 1, status: 'handed_over', assignmentStatus: 'ACCEPTED', offeredAt: new Date(), assignedAt: new Date(Date.now() + 1000 + i) } });
    }
    const first = await vendorHistory(f.vendor.id);
    expect(first.cards).toHaveLength(60);
    expect(first.more).toBe(true);
    expect(first.cards.some((c) => c.order.ref === f.order.ref)).toBe(false);
    expect((await vendorHistory(f.vendor.id, {}, 1)).cards.map((c) => c.order.ref)).toEqual([f.order.ref]);
    expect((await vendorHistory(f.vendor.id, { q: f.order.ref.toLowerCase() })).cards.map((c) => c.order.ref)).toEqual([f.order.ref]);
    expect(await vendorOrder(f.vendor.id, f.order.ref)).not.toBeNull();
  });
});
