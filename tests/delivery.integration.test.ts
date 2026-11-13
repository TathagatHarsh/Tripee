import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
// Checkout, below, runs the real /api/orders route and payment recovery outside a Next request.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {}, revalidatePath: () => {}, updateTag: () => {} }));
vi.mock('../lib/auth', () => ({ getViewer: async () => null }));
vi.mock('../lib/guestOrders', () => ({ rememberGuestOrders: async () => {} }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: vi.fn(async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' }))) }));
import { db } from '../lib/db';
import { assignmentCandidates, manualAssignment, moveFulfillment, respondToAssignment } from '../lib/assignment';
import { applyStatusTransition } from '../lib/orderTransition';
import { vendorNext } from '../lib/vendors';
import { isCovered } from '../lib/coverage';
import { DEFAULT_ROWS } from '../lib/catalogDefaults';
import { asJson, validateCheckout } from '../lib/checkoutValidate';
import { recoverPayment } from '../lib/paymentRecovery';
import { POST as placeOrder } from '../app/api/orders/route';

/**
 * One order from confirmed to the customer's door, the way the portals drive it
 * after the order-flow change: the office assigns, the bakery does everything
 * else. Runs only against an isolated database, like assignment.integration.
 */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
let serial = 0;

describe.skipIf(!url)('delivery lifecycle on isolated PostgreSQL', () => {
  /* Everything this suite makes carries a DLV- / delivery-test- / Delivery
     Bakery prefix; removing by prefix also clears rows from earlier runs, which
     otherwise crowd the scratch shop the e2e suite browses. */
  afterAll(async () => {
    const orders = { ref: { startsWith: 'DLV-' } };
    const vendors = { name: { startsWith: 'Delivery Bakery ' } };
    await db.order.updateMany({ where: orders, data: { currentAssignmentId: null } });
    await db.order.deleteMany({ where: orders });
    await db.inventoryAvailabilityChange.deleteMany({ where: { inventory: { vendor: vendors } } });
    await db.vendorInventory.deleteMany({ where: { vendor: vendors } });
    const vendorIds = (await db.vendor.findMany({ where: vendors, select: { id: true } })).map((v) => v.id);
    await db.portalNotification.deleteMany({ where: { OR: [{ vendorId: { in: vendorIds } }, { orderRef: { startsWith: 'DLV-' } }] } });
    await db.vendor.deleteMany({ where: vendors });
    await db.cakeProduct.deleteMany({ where: { slug: { startsWith: 'delivery-test-' } } });
    await db.$disconnect();
  });

  async function setup(opts: { pickup?: boolean; located?: boolean; vendorLat?: number } = {}) {
    const tag = `${Date.now()}-${++serial}`;
    const product = await db.cakeProduct.create({ data: { slug: `delivery-test-${tag}`, name: 'Chocolate Truffle', description: 'Test', category: 'chocolate', pricePaise: 189900, sizeBand: '2kg' } });
    const vendor = await db.vendor.create({ data: { name: `Delivery Bakery ${tag}`, locationSetAt: new Date(), isAcceptingOrders: true, fulfillsAllProducts: true, latitude: opts.vendorLat ?? 17.43, longitude: 78.4, serviceRadiusKm: 10 } });
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

    // The customer heard about baking, sending out and delivery — the same
    // updates as when staff move the order.
    const kinds = await db.notificationOutbox.findMany({ where: { orderId: order.id, kind: 'status_changed' }, select: { dedupeKey: true } });
    expect(kinds.map((k) => k.dedupeKey).sort()).toEqual([
      `order:${order.id}:status:delivered`,
      `order:${order.id}:status:in_kitchen`,
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

  describe('checkout against the delivery rules', () => {
    const keys: string[] = [];
    const slug = `delivery-test-checkout-${randomUUID().slice(0, 8)}`;
    let variantId = '';
    let createdStandardRow = false;

    const basket = (slot: string, requestedDate: string, requestedWindow: string) => {
      const idempotencyKey = randomUUID();
      keys.push(idempotencyKey);
      return {
        idempotencyKey, customerName: 'Rules Customer', customerPhone: '9876543210',
        items: [{ cakeSlug: slug, variantId, qty: 1, choices: { delivery: slot } }],
        fulfillment: { method: 'delivery', slot, recipientName: 'Rules Customer', addressLine1: '12 Test Street', city: 'Hyderabad', state: 'Telangana', pincode: '500081', requestedDate, requestedWindow, location: { lat: 17.44, lng: 78.38, placeId: '' } },
      };
    };
    const offline = (body: unknown) => {
      vi.stubEnv('PAYMENT_MODE', 'offline');
      vi.stubEnv('RAZORPAY_KEY_ID', '');
      vi.stubEnv('RAZORPAY_KEY_SECRET', '');
      vi.stubEnv('SERVICE_AREA', 'hyderabad');
      return placeOrder(new Request('http://localhost/api/orders', { method: 'POST', body: JSON.stringify(body) }));
    };

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });
    afterAll(async () => {
      await db.order.deleteMany({ where: { checkoutAttempt: { id: { in: keys } } } });
      await db.checkoutAttempt.deleteMany({ where: { id: { in: keys } } });
      await db.paymentRecovery.deleteMany({ where: { id: { in: keys } } });
      await db.cakeProduct.deleteMany({ where: { slug } });
      if (createdStandardRow) await db.catalogOption.deleteMany({ where: { category: 'delivery', value: 'standard' } });
    });

    beforeAll(async () => {
      const product = await db.cakeProduct.create({
        data: {
          slug, name: 'Rules Test Cake', description: 'Test', category: 'chocolate', pricePaise: 189900, sizeBand: '2kg',
          productionSpec: { version: 1, allergens: ['Egg', 'Milk'], ingredients: ['vanilla sponge'], dietaryClaims: [], preparationNotes: 'Test cake.', kitchenInstructions: 'Test cake.', allergenStatementReviewed: true },
          variants: { create: { sizeBand: '2kg', eggType: 'eggless', pricePaise: 189900 } },
        },
        include: { variants: true },
      });
      variantId = product.variants[0].id;
    });

    it('an ASAP ready-made order stores dueAt = now+4h, its window label and fee 15000', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-20T11:00:00+05:30'));
      const res = await offline(basket('asap', '2026-11-20', 'asap'));
      const json = await res.json();
      expect(res.status, JSON.stringify(json)).toBe(201);
      const order = await db.order.findUniqueOrThrow({ where: { ref: json.orderId } });
      expect(order.dueAt).toEqual(new Date('2026-11-20T15:00:00+05:30'));
      expect(order.requestedFor).toEqual(new Date('2026-11-20T13:00:00+05:30'));
      expect(order.requestedWindow).toBe('13:00–15:00');
      expect(order.deliverySlot).toBe('asap');
      expect(order.deliveryFeePaise).toBe(15000);
    });

    it('refuses an ASAP order arriving at 18:00:01', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-20T18:00:01+05:30'));
      const res = await offline(basket('asap', '2026-11-20', 'asap'));
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json).toMatchObject({ code: 'schedule_unavailable', field: 'requestedDate' });
      expect(json.error).toMatch(/stopped taking orders/);
    });

    it('refuses a legacy slot on a new checkout', async () => {
      const res = await offline(basket('standard', new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), 'x'));
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'slot_retired', error: 'That delivery option has changed. Choose a delivery time again.' });
    });

    it('recovery of a legacy-slot attempt is not refused', async () => {
      // As on the live shop, where the standard row predates its withdrawal from the defaults.
      if (!(await db.catalogOption.findFirst({ where: { category: 'delivery', value: 'standard' } }))) {
        const row = DEFAULT_ROWS.find((r) => r.category === 'delivery' && r.value === 'standard')!;
        await db.catalogOption.create({ data: { ...row, isAvailable: true } });
        createdStandardRow = true;
      }
      vi.stubEnv('SERVICE_AREA', 'hyderabad');
      const body = basket('standard', new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), 'x');
      const checked = await validateCheckout(body, 'test', true);
      if (checked.kind !== 'checked') throw new Error(`legacy basket did not validate: ${checked.kind === 'problem' ? await checked.response.text() : checked.kind}`);
      const amount = checked.checked.review.totalPaise;
      // What /api/payments/intent saved before the slot was retired.
      await db.paymentRecovery.create({ data: { id: body.idempotencyKey, request: asJson(checked.checked.body), payloadHash: checked.checked.hash } });

      const tag = randomUUID().replaceAll('-', '').slice(0, 10);
      const orderId = `order_DR${tag}`, paymentId = `pay_DR${tag}`;
      vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
      vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
      vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
        const target = String(input);
        if (target.endsWith(`/payments/${paymentId}`)) return Response.json({ id: paymentId, order_id: orderId, status: 'captured', amount, amount_refunded: 0, currency: 'INR' });
        if (target.endsWith(`/orders/${orderId}`)) return Response.json({ id: orderId, receipt: body.idempotencyKey, amount, currency: 'INR' });
        throw new Error(`unexpected fetch ${target}`);
      }));

      await recoverPayment(paymentId);

      const order = await db.order.findFirstOrThrow({ where: { razorpayPaymentId: paymentId } });
      expect(order).toMatchObject({ deliverySlot: 'standard', paymentStatus: 'paid', requestedWindow: '10:00–20:00' });
      expect(order.dueAt).toEqual(order.requestedFor);
      expect(await db.paymentRecovery.findUnique({ where: { id: body.idempotencyKey } })).toMatchObject({ status: 'completed' });
    });
  });
});
