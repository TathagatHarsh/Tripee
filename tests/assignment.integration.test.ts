import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/auth', () => ({ getViewer: async () => ({ userId: 'test-admin', profile: { role: 'ADMIN' } }) }));
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: vi.fn(async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' }))) }));
import { db, getDb } from '../lib/db';
import { POST as updateInventory } from '../app/api/inventory/route';
import { assignmentCandidates, expireAndAdvance, manualAssignment, moveFulfillment, respondToAssignment, startAssignment, correctDeliveryPin } from '../lib/assignment';
import { applyStatusTransition } from '../lib/orderTransition';
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
const vendorIds: string[] = [], orderIds: string[] = [], orderRefs: string[] = [], productIds: string[] = [];
let serial = 0;
describe.skipIf(!url)('inventory and assignment transactions on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; delete process.env.ASSIGNMENT_AUTO_REASSIGN; });
  afterEach(async () => {
    delete process.env.ASSIGNMENT_AUTO_REASSIGN;
    await db.order.updateMany({ where: { id: { in: orderIds } }, data: { currentAssignmentId: null } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.inventoryAvailabilityChange.deleteMany({ where: { inventory: { vendorId: { in: vendorIds } } } });
    await db.vendorInventory.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await db.portalNotification.deleteMany({ where: { OR: [{ vendorId: { in: vendorIds } }, { orderRef: { in: orderRefs } }] } });
    await db.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await db.cakeProduct.deleteMany({ where: { id: { in: productIds } } });
    orderIds.length = orderRefs.length = vendorIds.length = productIds.length = 0;
    vi.restoreAllMocks();
  });
  afterAll(async () => { await db.$disconnect(); });
  async function newOrder(productId: string) {
    const order = await db.order.create({ data: { ref: `INV-${Date.now()}-${++serial}`, cakeProductId: productId, config: { size: '2kg', eggless: true }, cakeName: 'Chocolate Truffle', status: 'confirmed', totalPaise: 189900, productSubtotalPaise: 180000, payablePaise: 189900, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.43, longitude: 78.4 } } });
    orderIds.push(order.id); orderRefs.push(order.ref); return order;
  }
  async function fixture(available = true, count = 2) {
    const product = await db.cakeProduct.create({ data: { slug: `availability-test-${Date.now()}-${++serial}`, name: 'Chocolate Truffle', description: 'Test', category: 'chocolate', pricePaise: 189900, sizeBand: '2kg' } }); productIds.push(product.id);
    const vendors = [];
    for (let i = 0; i < count; i++) {
      const v = await db.vendor.create({ data: { name: `Test Bakery ${i}`, isAcceptingOrders: true, fulfillsAllProducts: true, latitude: 17.43 + i * 0.001, longitude: 78.4, serviceRadiusKm: 20 } }); vendorIds.push(v.id); vendors.push(v);
      await db.vendorInventory.create({ data: { vendorId: v.id, productId: product.id, productName: product.name, sizeBand: '2kg', eggType: 'eggless', isAvailable: available } });
    }
    return { product, vendors, order: await newOrder(product.id) };
  }
  const current = async (orderId: string) => (await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { currentAssignment: true } })).currentAssignment!;
  const availabilityFor = (vendorId: string) => db.vendorInventory.findFirstOrThrow({ where: { vendorId } });
  it('unavailable delivery candidates keep honest routing and readable missing-variant labels', async () => {
    const { order, vendors: [vendor], product } = await fixture(false, 1);
    await db.vendor.update({ where: { id: vendor.id }, data: { latitude: 17.44 } });
    let candidate = (await assignmentCandidates(order.ref)).find(c => c.vendorId === vendor.id)!;
    expect(candidate).toMatchObject({ eligible: false, source: 'haversine_estimate' });
    expect(candidate.distanceKm).toBeGreaterThan(1);
    expect(candidate.estimatedMinutes).toBeGreaterThan(0);
    await db.vendorInventory.deleteMany({ where: { vendorId: vendor.id } });
    candidate = (await assignmentCandidates(order.ref)).find(c => c.vendorId === vendor.id)!;
    expect(candidate.inventory).toEqual([{ product: 'Chocolate Truffle · 2kg · eggless', isAvailable: false }]);
    expect(candidate.reasons.join(' ')).not.toContain(product.id);
    await db.vendor.update({ where: { id: vendor.id }, data: { latitude: null, longitude: null } });
    candidate = (await assignmentCandidates(order.ref)).find(c => c.vendorId === vendor.id)!;
    expect(candidate).toMatchObject({ source: 'unknown', distanceKm: null, estimatedMinutes: null, eligible: false });
    await db.order.update({ where: { id: order.id }, data: { fulfillmentMethod: 'pickup' } });
    expect((await assignmentCandidates(order.ref)).find(c => c.vendorId === vendor.id)).toMatchObject({ source: 'pickup', distanceKm: 0, estimatedMinutes: 0 });
  });
  it('multi-cake missing availability uses each snapshot or catalogue name', async () => {
    const { order, vendors: [vendor], product } = await fixture(false, 1);
    await db.vendorInventory.deleteMany({ where: { vendorId: vendor.id } });
    await db.orderCake.create({ data: { orderId: order.id, position: 0, cakeProductId: product.id, cakeName: 'Celebration Cake', config: { size: '1kg', eggless: true }, priceBreakdown: {}, totalPaise: 100, allergens: [], servesMin: 1, servesMax: 2, productionSpec: {} } });
    let candidate = (await assignmentCandidates(order.ref)).find(c => c.vendorId === vendor.id)!;
    expect(candidate.inventory).toEqual([{ product: 'Celebration Cake · 1kg · eggless', isAvailable: false }]);
    await db.orderCake.updateMany({ where: { orderId: order.id }, data: { cakeName: null } });
    candidate = (await assignmentCandidates(order.ref)).find(c => c.vendorId === vendor.id)!;
    expect(candidate.inventory).toEqual([{ product: 'Chocolate Truffle · 1kg · eggless', isAvailable: false }]);
  });
  it('checkout waits for admin; assignment checks availability before notifying and requires acceptance', async () => {
    const { order, vendors } = await fixture(); await startAssignment(order.ref);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).assignmentState).toBe('MANUAL');
    expect(await db.vendorOrder.count({ where: { orderId: order.id } })).toBe(0);
    await manualAssignment(order.ref, vendors[0].id, null);
    const row = await current(order.id); expect(row.assignmentStatus).toBe('OFFERED'); expect(row.acceptedAt).toBeNull();
    expect((await availabilityFor(vendors[0].id)).isAvailable).toBe(true);
    expect(await db.portalNotification.count({ where: { vendorId: vendors[0].id, title: 'New order request' } })).toBe(1);
  });
  it('accepted production continues after availability turns off', async () => {
    const { order, vendors } = await fixture(); const v = vendors[0].id;
    await manualAssignment(order.ref, v, null); const row = await current(order.id);
    await respondToAssignment(v, order.ref, row.id, 'ACCEPTED');
    await db.vendorInventory.updateMany({ where: { vendorId: v }, data: { isAvailable: false } });
    for (const status of ['in_preparation', 'ready', 'handed_over'] as const) expect(await moveFulfillment(v, order.ref, status, row.id)).toBe(true);
    expect(await moveFulfillment(v, order.ref, 'handed_over', row.id)).toBe(false);
    expect(await availabilityFor(v)).toMatchObject({ isAvailable: false });
    expect(await db.inventoryAvailabilityChange.count({ where: { inventory: { vendorId: { in: vendorIds } } } })).toBe(0);
    expect(await applyStatusTransition(order.ref, 'out_for_delivery', null)).toBe(true);
    expect(await applyStatusTransition(order.ref, 'delivered', null)).toBe(true);
    await expect(manualAssignment(order.ref, vendors[1].id, null)).rejects.toThrow();
  });
  it('rejection preserves availability, preserves customer order, and lets admin choose another bakery', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null); const first = await current(order.id);
    await respondToAssignment(vendors[0].id, order.ref, first.id, 'REJECTED', 'At capacity');
    expect(await availabilityFor(vendors[0].id)).toMatchObject({ isAvailable: true });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ currentAssignmentId: null, status: 'confirmed', assignmentState: 'MANUAL' });
    await manualAssignment(order.ref, vendors[1].id, null); const second = await current(order.id);
    await respondToAssignment(vendors[1].id, order.ref, second.id, 'ACCEPTED');
    expect(await db.vendorOrder.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: 'rejected', rejectionReason: 'At capacity' });
  });
  it('two simultaneous orders can use the same available variant', async () => {
    const { order, product, vendors } = await fixture(true, 1); const other = await newOrder(product.id);
    const results = await Promise.allSettled([manualAssignment(order.ref, vendors[0].id, null), manualAssignment(other.ref, vendors[0].id, null)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2);
    expect(await availabilityFor(vendors[0].id)).toMatchObject({ isAvailable: true });
  });
  it('A and C are available while B is unavailable for the exact product, size and egg type', async () => {
    const { order, product, vendors: [a, b, c] } = await fixture(true, 3);
    await db.vendorInventory.updateMany({ where: { vendorId: b.id }, data: { isAvailable: false } });
    // B's other variants must not make the requested 2kg eggless variant eligible.
    await db.vendorInventory.createMany({ data: [
      { vendorId: b.id, productId: product.id, productName: product.name, sizeBand: '1kg', eggType: 'eggless' as const, isAvailable: true },
      { vendorId: b.id, productId: product.id, productName: product.name, sizeBand: '2kg', eggType: 'egg' as const, isAvailable: true },
    ] });
    const candidates = await assignmentCandidates(order.ref);
    expect(candidates.filter(candidate => candidate.eligible).map(candidate => candidate.vendorId).sort()).toEqual([a.id, c.id].sort());
    expect(candidates.find(candidate => candidate.vendorId === b.id)).toMatchObject({ eligible: false, inventory: [{ isAvailable: false }] });
    await expect(manualAssignment(order.ref, b.id, null)).rejects.toThrow();
    await manualAssignment(order.ref, a.id, null);
    await manualAssignment(order.ref, c.id, null, (await current(order.id)).id);
    expect((await current(order.id)).vendorId).toBe(c.id);
  });
  it('repeated assignments and acceptance never decrement or reserve availability', async () => {
    const { order, product, vendors: [vendor] } = await fixture(true, 1);
    const before = await availabilityFor(vendor.id);
    for (const next of [order, await newOrder(product.id), await newOrder(product.id)]) {
      await manualAssignment(next.ref, vendor.id, null);
      await respondToAssignment(vendor.id, next.ref, (await current(next.id)).id, 'ACCEPTED');
      expect(await availabilityFor(vendor.id)).toEqual(before);
    }
    expect(await db.vendorOrder.count({ where: { vendorId: vendor.id, assignmentStatus: 'ACCEPTED' } })).toBe(3);
    expect(await db.inventoryAvailabilityChange.count({ where: { inventoryId: before.id } })).toBe(0);
  });
  it('rechecks availability inside assignment after an eligible candidate becomes out of stock', async () => {
    const { order, vendors: [vendor] } = await fixture(true, 1);
    expect((await assignmentCandidates(order.ref)).find(candidate => candidate.vendorId === vendor.id)?.eligible).toBe(true);
    // Turn availability off between candidate selection and the assignment transaction.
    const transaction = db.$transaction.bind(db);
    vi.spyOn(getDb(), '$transaction').mockImplementationOnce((async (...args: Parameters<typeof transaction>) => {
      await db.vendorInventory.updateMany({ where: { vendorId: vendor.id }, data: { isAvailable: false } });
      return transaction(...args);
    }) as typeof db.$transaction);
    await expect(manualAssignment(order.ref, vendor.id, null)).rejects.toThrow('unavailable');
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).currentAssignmentId).toBeNull();
    expect(await db.vendorOrder.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.portalNotification.count({ where: { vendorId: vendor.id, title: 'New order request' } })).toBe(0);
  });
  it('same-order concurrent admin assignments cannot both succeed', async () => {
    const { order, vendors } = await fixture();
    const results = await Promise.allSettled(vendors.map(v => manualAssignment(order.ref, v.id, null, null)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('stale response, wrong vendor and stale production actions cannot win', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null); const first = await current(order.id);
    await expect(respondToAssignment(vendors[1].id, order.ref, first.id, 'ACCEPTED')).rejects.toThrow();
    await manualAssignment(order.ref, vendors[1].id, null, first.id); const second = await current(order.id);
    await expect(respondToAssignment(vendors[0].id, order.ref, first.id, 'ACCEPTED')).rejects.toThrow();
    await expect(respondToAssignment(vendors[0].id, order.ref, first.id, 'REJECTED', 'Unavailable')).rejects.toThrow();
    await respondToAssignment(vendors[1].id, order.ref, second.id, 'ACCEPTED');
    expect(await moveFulfillment(vendors[1].id, order.ref, 'in_preparation', first.id)).toBe(false);
    expect((await availabilityFor(vendors[0].id)).isAvailable).toBe(true);
  });
  it('filters variant availability, capacity and preparation before distance', async () => {
    const { order, vendors } = await fixture(false, 1); const v = vendors[0];
    expect((await assignmentCandidates(order.ref))[0].eligible).toBe(false);
    await db.vendorInventory.updateMany({ where: { vendorId: v.id }, data: { isAvailable: true } });
    expect((await assignmentCandidates(order.ref))[0].eligible).toBe(true);
    for (const change of [{ isAcceptingOrders: false }, { maxConcurrentOrders: 0 }, { preparationMinutes: 10080 }, { isActive: false }]) {
      await db.vendor.update({ where: { id: v.id }, data: change }); expect((await assignmentCandidates(order.ref))[0].eligible).toBe(false);
      await db.vendor.update({ where: { id: v.id }, data: { isAcceptingOrders: true, maxConcurrentOrders: 10, preparationMinutes: 120, isActive: true } });
    }
    await db.order.update({ where: { id: order.id }, data: { config: { size: '2kg', eggless: false } } });
    expect((await assignmentCandidates(order.ref))[0].eligible).toBe(false);
  });
  it('cancellation preserves availability even when acceptance races', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null); const row = await current(order.id);
    await Promise.allSettled([respondToAssignment(vendors[0].id, order.ref, row.id, 'ACCEPTED'), applyStatusTransition(order.ref, 'cancelled', null)]);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'cancelled', currentAssignmentId: null });
    expect((await availabilityFor(vendors[0].id)).isAvailable).toBe(true);
  });
  it('expiry preserves availability and returns to admin', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null); const row = await current(order.id);
    await db.vendorOrder.update({ where: { id: row.id }, data: { expiresAt: new Date(0) } });
    await expireAndAdvance(order.ref); await expireAndAdvance(order.ref);
    expect((await availabilityFor(vendors[0].id)).isAvailable).toBe(true);
  });
  it('explicit automatic recovery offers the next available bakery', async () => {
    process.env.ASSIGNMENT_AUTO_REASSIGN = 'true';
    const { order, vendors } = await fixture(true, 3); await manualAssignment(order.ref, vendors[0].id, null); const first = await current(order.id);
    await db.vendorInventory.updateMany({ where: { vendorId: vendors[1].id }, data: { isAvailable: false } });
    await respondToAssignment(vendors[0].id, order.ref, first.id, 'REJECTED', 'Oven unavailable');
    const next = await current(order.id); expect(next.vendorId).toBe(vendors[2].id); expect(next.assignmentStatus).toBe('OFFERED');
    expect((await availabilityFor(vendors[1].id)).isAvailable).toBe(false);
  });
  it('capacity blocks manual assignment', async () => {
    const { order, vendors } = await fixture(true, 1);
    await db.vendor.update({ where: { id: vendors[0].id }, data: { maxConcurrentOrders: 0 } });
    await expect(manualAssignment(order.ref, vendors[0].id, null)).rejects.toThrow();
    expect(await db.vendorOrder.count({ where: { orderId: order.id } })).toBe(0);
  });
  it('availability turning off blocks acceptance and reassignment', async () => {
    const { order, vendors } = await fixture(true, 1);
    const v = vendors[0].id;
    await manualAssignment(order.ref, v, null);
    const row = await current(order.id);
    await db.vendorInventory.updateMany({ where: { vendorId: v }, data: { isAvailable: false } });
    await expect(respondToAssignment(v, order.ref, row.id, 'ACCEPTED')).rejects.toThrow('unavailable');
    await expect(manualAssignment(order.ref, v, null, row.id)).rejects.toThrow();
    expect((await current(order.id)).assignmentStatus).toBe('OFFERED');
  });
  it('multiple physical cakes need availability, not quantities', async () => {
    const { order, vendors, product } = await fixture(true, 1);
    await db.orderCake.createMany({ data: [0, 1].map(position => ({ orderId: order.id, position, cakeProductId: product.id, config: { size: '2kg', eggless: true }, priceBreakdown: {}, totalPaise: 189900, allergens: [], servesMin: 10, servesMax: 12, productionSpec: {} })) });
    await manualAssignment(order.ref, vendors[0].id, null);
    expect((await availabilityFor(vendors[0].id)).isAvailable).toBe(true);
    expect(await db.vendorOrder.count({ where: { orderId: order.id } })).toBe(1);
  });
  it('pickup uses availability and capacity without requiring coordinates', async () => {
    const { order, vendors } = await fixture(); await db.order.update({ where: { id: order.id }, data: { fulfillmentMethod: 'pickup' } });
    await db.vendor.update({ where: { id: vendors[0].id }, data: { latitude: null, longitude: null } });
    await manualAssignment(order.ref, vendors[0].id, null); const row = await current(order.id);
    expect((await respondToAssignment(vendors[0].id, order.ref, row.id, 'ACCEPTED')).ok).toBe(true);
  });
  it('batch adds are atomic and retries preserve toggles with silent timestamped audits', async () => {
    const { vendors, product } = await fixture();
    const vendorId = vendors[0].id;
    const variants = await Promise.all(['egg', 'eggless'].map(eggType => db.cakeVariant.create({ data: { cakeId: product.id, sizeBand: '1kg', eggType: eggType as 'egg' | 'eggless', pricePaise: 10000 } })));
    const post = (body: unknown) => updateInventory(new Request('http://localhost/api/inventory', { method: 'POST', body: JSON.stringify(body) }));
    const notifications = await db.portalNotification.count();
    expect((await post({ vendorId, variantIds: [variants[0].id, 'missing'] })).status).toBe(409);
    expect(await db.vendorInventory.count({ where: { vendorId } })).toBe(1);
    const body = { vendorId, variantIds: [...variants.map(v => v.id), variants[0].id] };
    expect(await (await post(body)).json()).toEqual({ ok: true });
    const item = await db.vendorInventory.findFirstOrThrow({ where: { vendorId, sizeBand: '1kg' } });
    expect((await post({ vendorId, id: item.id, isAvailable: false })).status).toBe(200);
    expect((await post(body)).status).toBe(200);
    expect(await db.vendorInventory.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ isAvailable: false });
    const audit = await db.inventoryAvailabilityChange.findMany({ where: { inventoryId: item.id }, orderBy: { createdAt: 'asc' } });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ previousAvailable: null, newAvailable: true, userId: 'test-admin' });
    expect(audit[1]).toMatchObject({ previousAvailable: true, newAvailable: false, userId: 'test-admin' });
    expect(audit[1].createdAt).toBeInstanceOf(Date);
    expect(await db.portalNotification.count()).toBe(notifications);
  });
  it('legacy capacity override cannot bypass acceptance eligibility', async () => {
    const { order, vendors } = await fixture(true, 1);
    await manualAssignment(order.ref, vendors[0].id, null);
    const row = await current(order.id);
    await db.vendorOrder.update({ where: { id: row.id }, data: { capacityOverride: true } });
    await db.vendor.update({ where: { id: vendors[0].id }, data: { maxConcurrentOrders: 0 } });
    await expect(respondToAssignment(vendors[0].id, order.ref, row.id, 'ACCEPTED')).rejects.toThrow('unavailable');
  });
  it('earnings remain frozen and delivery correction keeps rejection history', async () => {
    const { order, vendors } = await fixture(); await manualAssignment(order.ref, vendors[0].id, null); const row = await current(order.id);
    await db.vendor.update({ where: { id: vendors[0].id }, data: { commissionBps: 9000 } });
    await respondToAssignment(vendors[0].id, order.ref, row.id, 'REJECTED', 'Unavailable');
    await correctDeliveryPin(order.ref, { lat: 17.43, lng: 78.4 }, 'test');
    expect(await db.vendorOrder.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ vendorEarningPaise: row.vendorEarningPaise, status: 'rejected' });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).currentAssignmentId).toBeNull();
  });
});
