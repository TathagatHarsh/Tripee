import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/auth', () => ({ getViewer: async () => ({ userId: 'test-admin', profile: { role: 'ADMIN' } }) }));
const defaultDistance = vi.hoisted(() => async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' })));
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: vi.fn(defaultDistance) }));
import { db } from '../lib/db';
import { manualAssignment, moveFulfillment, respondToAssignment, startAssignment } from '../lib/assignment';
import { applyStatusTransition } from '../lib/orderTransition';
import { loadOrderFacts, whatsappNewOrder } from '../lib/whatsappEvents';
import { offerMessage } from '../lib/whatsappMessages';
import { handleInbound } from '../lib/whatsappInbound';
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
const vendorIds: string[] = [], orderIds: string[] = [], orderRefs: string[] = [], productIds: string[] = [];
let serial = 0;
const ADMIN = '919000000001';
describe.skipIf(!url)('WhatsApp messages for every order step on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; delete process.env.ASSIGNMENT_AUTO_REASSIGN; });
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'secret'); vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '9000000001');
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    delete process.env.ASSIGNMENT_AUTO_REASSIGN; delete process.env.ASSIGNMENT_AUTO_START;
    await db.order.updateMany({ where: { id: { in: orderIds } }, data: { currentAssignmentId: null } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.vendorInventory.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await db.portalNotification.deleteMany({ where: { OR: [{ vendorId: { in: vendorIds } }, { orderRef: { in: orderRefs } }] } });
    await db.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await db.cakeProduct.deleteMany({ where: { id: { in: productIds } } });
    orderIds.length = orderRefs.length = vendorIds.length = productIds.length = 0;
  });
  afterAll(async () => { await db.$disconnect(); });
  async function fixture(available = true, count = 2) {
    const product = await db.cakeProduct.create({ data: { slug: `wa-test-${Date.now()}-${++serial}`, name: 'Chocolate Truffle', description: 'Test', category: 'chocolate', pricePaise: 189900, sizeBand: '2kg' } }); productIds.push(product.id);
    const vendors = [];
    for (let i = 0; i < count; i++) {
      const v = await db.vendor.create({ data: { name: `Test Bakery ${i}`, phone: `98765 4321${i}`, isAcceptingOrders: true, fulfillsAllProducts: true, latitude: 17.43 + i * 0.001, longitude: 78.4, serviceRadiusKm: 20 } }); vendorIds.push(v.id); vendors.push(v);
      await db.vendorInventory.create({ data: { vendorId: v.id, productId: product.id, productName: product.name, sizeBand: '2kg', eggType: 'eggless', isAvailable: available } });
    }
    const order = await db.order.create({ data: { ref: `WA-${Date.now()}-${++serial}`, cakeProductId: product.id, config: { size: '2kg', eggless: true }, cakeName: 'Chocolate Truffle', status: 'confirmed', totalPaise: 189900, productSubtotalPaise: 180000, payablePaise: 189900, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.43, longitude: 78.4 } } });
    orderIds.push(order.id); orderRefs.push(order.ref);
    return { product, vendors, order };
  }
  const wa = (orderId: string) => db.notificationOutbox.findMany({ where: { orderId, channel: 'whatsapp' }, orderBy: { createdAt: 'asc' } });
  const current = async (orderId: string) => (await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { currentAssignment: true } })).currentAssignment!;
  type Comp = { type: string; parameters: { text?: string; image?: { link: string } }[] };
  const comps = (row: { payload: unknown }) => (row.payload as { components: Comp[] }).components;
  const bodyText = (row: { payload: unknown }) => comps(row).find(c => c.type === 'body')!.parameters.map(p => p.text);
  const adminTexts = async (orderId: string) => (await wa(orderId)).filter(r => r.destination === ADMIN).map(r => bodyText(r)[1]);
  const cakeRow = (orderId: string, position: number, cakeName: string, sizeBand: string, eggType: 'egg' | 'eggless', message?: string) =>
    db.orderCake.create({ data: { orderId, position, cakeName, sizeBand, eggType, message, config: {}, priceBreakdown: {}, totalPaise: 100, allergens: [], servesMin: 1, servesMax: 2, productionSpec: {} } });

  it('an offer queues the vendor template and an admin update', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null);
    const rows = await wa(order.id); const offer = await current(order.id);
    const toVendor = rows.find(r => r.destination === '919876543210')!;
    expect(toVendor.payload).toMatchObject({ type: 'template', name: 'order_offer' });
    expect(JSON.stringify(toVendor.payload)).toContain(`accept:${offer.id}`);
    expect(bodyText(toVendor)).toEqual([order.ref, 'Chocolate Truffle · 2kg · eggless', expect.any(String), '-', '2.0', expect.any(String), '15']);
    expect(bodyText(rows.find(r => r.destination === ADMIN)!)).toEqual([order.ref, 'Offered to Test Bakery 0 (2.0 km)']);
  });
  it('a vendor without a phone is flagged to the admin', async () => {
    const { order, vendors } = await fixture(); await db.vendor.update({ where: { id: vendors[0].id }, data: { phone: null } });
    await manualAssignment(order.ref, vendors[0].id, null);
    const rows = await wa(order.id);
    expect(rows).toHaveLength(1);
    expect(bodyText(rows[0])[1]).toBe('Offered to Test Bakery 0 (2.0 km) - no WhatsApp number on file');
  });
  it('rejection, acceptance and every production step reach the admin', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null);
    await respondToAssignment(vendors[0].id, order.ref, (await current(order.id)).id, 'REJECTED', 'Oven unavailable');
    await manualAssignment(order.ref, vendors[1].id, null);
    const row = await current(order.id); await respondToAssignment(vendors[1].id, order.ref, row.id, 'ACCEPTED');
    for (const status of ['in_preparation', 'ready', 'handed_over'] as const) expect(await moveFulfillment(vendors[1].id, order.ref, status, row.id)).toBe(true);
    expect(await adminTexts(order.id)).toEqual([
      'Offered to Test Bakery 0 (2.0 km)', 'Test Bakery 0 rejected: Oven unavailable', 'Offered to Test Bakery 1 (2.0 km)', 'Test Bakery 1 accepted',
      'Test Bakery 1 started preparing', 'Test Bakery 1 marked it ready', 'Test Bakery 1 handed it over',
    ]);
  });
  it('cancellation tells the admin and the vendor that held it', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null);
    await respondToAssignment(vendors[0].id, order.ref, (await current(order.id)).id, 'ACCEPTED');
    expect(await applyStatusTransition(order.ref, 'cancelled', null, 'Customer asked')).toBe(true);
    const rows = await wa(order.id);
    expect(rows.filter(r => r.destination === ADMIN).map(r => bodyText(r)[1])).toContain('Cancelled: Customer asked');
    const toVendor = rows.filter(r => r.destination === '919876543210' && r.kind === 'order_cancelled');
    expect(toVendor.map(r => bodyText(r))).toEqual([[order.ref, 'Cancelled. Please stop work on this order.']]);
  });
  it('no bakery left alerts the admin with the order link', async () => {
    process.env.ASSIGNMENT_AUTO_START = 'true'; const { order } = await fixture(false); await startAssignment(order.ref);
    const [text] = await adminTexts(order.id);
    expect(text).toContain(`/admin/orders/${order.ref}`); expect(text?.startsWith('⚠️')).toBe(true);
    await startAssignment(order.ref); expect(await adminTexts(order.id)).toHaveLength(1);
  });
  it('new order: admin template with the signed photo link and every cake named', async () => {
    const { order } = await fixture();
    await cakeRow(order.id, 0, 'Chocolate Truffle', '1kg', 'eggless'); await cakeRow(order.id, 1, 'Red Velvet', '500g', 'egg');
    await db.$transaction(tx => whatsappNewOrder(tx, order.id));
    const row = (await wa(order.id)).find(r => r.destination === ADMIN)!;
    expect(row.payload).toMatchObject({ type: 'template', name: 'admin_new_order' });
    expect(comps(row).find(c => c.type === 'header')!.parameters[0].image!.link).toContain(`/api/whatsapp/photo/${order.id}?s=`);
    expect(bodyText(row)[2]).toContain('Chocolate Truffle'); expect(bodyText(row)[2]).toContain('Red Velvet');
  });
  it("a long multi-cake order keeps the customer's message inside the offer's cake param", async () => {
    const { order } = await fixture();
    for (let i = 0; i < 4; i++) await cakeRow(order.id, i, `Celebration Chocolate Truffle Deluxe ${i}`, '2kg', 'eggless', i === 1 ? 'Happy  birthday\nAsha' : undefined);
    const facts = await db.$transaction(tx => loadOrderFacts(tx, order.id));
    expect(facts.cake.length).toBeLessThanOrEqual(120); expect(facts.cake).toContain('…'); expect(facts.cake.endsWith('· message "Happy birthday Asha"')).toBe(true);
    const offer = offerMessage(facts, { assignmentId: 'a1', distanceKm: 1, earningPaise: 100, replyMinutes: 15 });
    expect(JSON.stringify(offer)).toContain('message \\"Happy birthday Asha\\"');
  });
  it('nothing is queued when WhatsApp is not configured', async () => {
    vi.unstubAllEnvs(); const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null);
    expect(await wa(order.id)).toHaveLength(0);
  });
  describe('vendor replies', () => {
    const sent = vi.fn();
    beforeEach(() => { sent.mockReset(); sent.mockResolvedValue({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', sent); });
    afterEach(() => { vi.unstubAllGlobals(); });
    const directTexts = () => sent.mock.calls.map(([, init]) => JSON.parse((init as { body: string }).body).text.body as string);
    const offered = async () => { const f = await fixture(); await manualAssignment(f.order.ref, f.vendors[0].id, null); return { ...f, offer: await current(f.order.id) }; };

    it('accept by button accepts and replies with the step buttons', async () => {
      const { order, offer } = await offered();
      await handleInbound({ id: 'wamid.1', from: '919876543210', payload: `accept:${offer.id}` });
      expect((await current(order.id)).assignmentStatus).toBe('ACCEPTED');
      const reply = await db.notificationOutbox.findUniqueOrThrow({ where: { dedupeKey: 'wa-reply:wamid.1:919876543210' } });
      expect(reply.payload).toMatchObject({ type: 'buttons', buttons: [{ id: `start:${offer.id}` }, {}, {}] });
    });
    it('typed "order started" after a website accept starts preparation', async () => {
      const { order, vendors, offer } = await offered();
      await respondToAssignment(vendors[0].id, order.ref, offer.id, 'ACCEPTED');
      await handleInbound({ id: 'wamid.2', from: '919876543210', text: 'Order started' });
      expect((await current(order.id)).status).toBe('in_preparation');
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('in_kitchen');
    });
    it('a retried webhook message gets one reply', async () => {
      const { order, offer } = await offered();
      for (let i = 0; i < 2; i++) await handleInbound({ id: 'wamid.3', from: '919876543210', payload: `accept:${offer.id}` });
      expect((await current(order.id)).assignmentStatus).toBe('ACCEPTED');
      expect(await db.notificationOutbox.count({ where: { dedupeKey: { startsWith: 'wa-reply:wamid.3:' } } })).toBe(1);
    });
    it("another vendor's assignment id is refused", async () => {
      const { order, offer } = await offered();
      await handleInbound({ id: 'wamid.4', from: '919876543211', payload: `accept:${offer.id}` });
      expect((await current(order.id)).assignmentStatus).toBe('OFFERED');
      expect(directTexts()).toContain("That order isn't waiting on you any more.");
    });
    it('the admin number that is also a vendor acts as that vendor', async () => {
      vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '9876543210');
      const { order } = await offered();
      await handleInbound({ id: 'wamid.5', from: '919876543210', text: 'yes' });
      expect((await current(order.id)).assignmentStatus).toBe('ACCEPTED');
      expect(directTexts()).toEqual([]);
    });
    it('a stranger gets the fixed line', async () => {
      await handleInbound({ id: 'wamid.6', from: '919111111111', text: 'hi' });
      expect(directTexts()).toEqual(['This number is for MakeYourCakes bakery partners. For your order, use the link in your confirmation.']);
    });
  });
});
