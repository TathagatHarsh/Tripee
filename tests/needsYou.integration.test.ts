import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: (f: unknown) => f }));
import { db } from '../lib/db';
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' })) }));
import { manualAssignment, respondToAssignment } from '../lib/assignment';
import { loadNeedsYou, needsYouCount } from '../lib/needsYouData';

const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
const tag = Date.now();

async function order(suffix: string, status: 'draft' | 'confirmed', dueInMs: number, assigned?: string) {
  const product = await db.cakeProduct.findFirstOrThrow();
  const o = await db.order.create({ data: { ref: `NY-${tag}-${suffix}`, cakeProductId: product.id, config: { size: '1kg' }, cakeName: 'Test cake', status, totalPaise: 100000, productSubtotalPaise: 100000, payablePaise: 100000, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + dueInMs), deliveryLocation: { latitude: 17.43, longitude: 78.4 }, customerPhone: '+919876543210' } });
  if (assigned) {
    const a = await db.vendorOrder.create({ data: { orderId: o.id, vendorId: assigned, status: 'accepted', assignmentStatus: 'ACCEPTED' } });
    await db.order.update({ where: { id: o.id }, data: { currentAssignmentId: a.id } });
  }
  return o;
}

describe.skipIf(!url)('needs-you loader on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it('surfaces each category and the count matches the total', async () => {
    const live = await db.vendor.create({ data: { name: `NY live ${tag}`, isAcceptingOrders: true, locationSetAt: new Date() } });
    const draft = await order('draft', 'draft', 86400000);
    const stuck = await order('stuck', 'confirmed', 86400000);
    const late = await order('late', 'confirmed', 3600000, live.id);
    const review = await db.vendor.create({ data: { name: `NY review ${tag}`, isActive: false, locationSetAt: new Date(), detailsConfirmedAt: new Date() } });
    await db.vendorInventory.create({ data: { vendorId: review.id, productId: (await db.cakeProduct.findFirstOrThrow()).id, productName: 'x', sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
    await db.userProfile.create({ data: { id: `ny-user-${tag}`, vendorId: review.id } });
    const quote = await db.customRequest.create({ data: { ref: `CR-NY-${tag}`, token: `ny-${tag}`, name: 'Q', phone: '919876543210', photoUrl: 'x', sizeKg: 1, flavour: 'choc', dueAt: new Date(Date.now() + 86400000), address: {} } });

    const { result, glance } = await loadNeedsYou();
    const keys = result.items.map((i) => i.key);
    expect(keys).toContain(`new:${draft.ref}`);
    expect(keys).toContain(`stuck:${stuck.ref}`);
    expect(keys).toContain(`late:${late.ref}`);
    expect(keys).toContain(`quote:${quote.id}`);
    expect(keys).toContain(`review:${review.id}`);
    expect(glance.ordersToday).toBeGreaterThanOrEqual(3);
    expect(await needsYouCount()).toBe((await loadNeedsYou()).result.total);
  });

  it('shows a rejected offer as Rejected with the reason and Reassign', async () => {
    const vendor = await db.vendor.create({ data: { name: `NY rej ${tag}`, locationSetAt: new Date(), isAcceptingOrders: true, fulfillsAllProducts: true, latitude: 17.43, longitude: 78.4, serviceRadiusKm: 20 } });
    const product = await db.cakeProduct.create({ data: { slug: `ny-rej-${tag}`, name: 'NY cake', description: 'x', category: 'chocolate', pricePaise: 100000, sizeBand: '1kg' } });
    await db.vendorInventory.create({ data: { vendorId: vendor.id, productId: product.id, productName: product.name, sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
    const o = await db.order.create({ data: { ref: `NY-${tag}-rej`, cakeProductId: product.id, config: { size: '1kg', eggless: true }, cakeName: product.name, status: 'confirmed', totalPaise: 100000, productSubtotalPaise: 100000, payablePaise: 100000, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.43, longitude: 78.4 }, customerPhone: '+919876543210' } });
    await manualAssignment(o.ref, vendor.id, null, null);
    const id = (await db.order.findUniqueOrThrow({ where: { id: o.id } })).currentAssignmentId!;
    await respondToAssignment(vendor.id, o.ref, id, 'REJECTED', 'Oven broken');
    const item = (await loadNeedsYou()).result.items.find((i) => i.key === `stuck:${o.ref}`);
    expect(item).toMatchObject({ tag: 'Rejected', action: { label: 'Reassign' }, href: `/admin/orders/${o.ref}` });
    expect(item!.detail).toContain('Oven broken');
    expect(item!.title).toContain(o.ref);
  });

  it('only recoveries and refunds with an error are requests; plain pending is not', async () => {
    const plain = await db.paymentRecovery.create({ data: { id: `ny-plain-${tag}`, request: {}, payloadHash: 'h', createdAt: new Date(Date.now() - 3600000) } });
    const bad = await db.paymentRecovery.create({ data: { id: `ny-bad-${tag}`, request: {}, payloadHash: 'h', status: 'refund_required', lastError: 'amount differs', createdAt: new Date(Date.now() - 3600000) } });
    const keys = (await loadNeedsYou()).result.items.map((i) => i.key);
    expect(keys).not.toContain(`followup:recovery:${plain.id}`);
    expect(keys).toContain(`followup:recovery:${bad.id}`);
  });
});
