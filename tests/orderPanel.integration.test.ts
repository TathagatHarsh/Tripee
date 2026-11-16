import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '../lib/db';
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' })) }));
import { manualAssignment, respondToAssignment } from '../lib/assignment';
import { loadOrderPanel } from '../lib/orderPanelData';

const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
const tag = Date.now();

async function bakery(name: string, phone: string, productId: string) {
  const v = await db.vendor.create({ data: { name: `${name} ${tag}`, phone, locationSetAt: new Date(), isAcceptingOrders: true, latitude: 17.43, longitude: 78.4, serviceRadiusKm: 20 } });
  await db.vendorInventory.create({ data: { vendorId: v.id, productId, productName: 'OP cake', sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
  return v;
}

async function order(suffix: string, customerPhone: string) {
  const product = await db.cakeProduct.create({ data: { slug: `op-${suffix}-${tag}`, name: 'OP cake', description: 'x', category: 'chocolate', pricePaise: 100000, sizeBand: '1kg' } });
  const o = await db.order.create({ data: { ref: `OP-${tag}-${suffix}`, cakeProductId: product.id, config: { size: '1kg', eggless: true }, cakeName: product.name, status: 'confirmed', totalPaise: 100000, productSubtotalPaise: 100000, payablePaise: 100000, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.43, longitude: 78.4 }, customerPhone } });
  return { o, product };
}

describe.skipIf(!url)('order quick-view panel loader on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it('lists a rejected offer then the re-offer, and Call bakery targets the new bakery', async () => {
    const { o, product } = await order('rej', '+919876543210');
    const a = await bakery('OP Alpha', '9000000001', product.id);
    const b = await bakery('OP Beta', '9000000002', product.id);
    await manualAssignment(o.ref, a.id, null, null);
    const first = (await db.order.findUniqueOrThrow({ where: { id: o.id } })).currentAssignmentId!;
    await respondToAssignment(a.id, o.ref, first, 'REJECTED', 'Oven broken');
    await manualAssignment(o.ref, b.id, null, null);

    const panel = await loadOrderPanel(o.ref);
    expect(panel).not.toBeNull();
    expect(panel!.attempts).toHaveLength(2);
    expect(panel!.attemptLines[0]).toContain('said no (Oven broken)');
    expect(panel!.attemptLines[1]).toContain(`Offered to OP Beta ${tag}`);
    expect(panel!.bakeryLine).toBe('finding a bakery (2nd try)');
    expect(panel!.callBakeryHref).toBe('tel:+919000000002');
    expect(panel!.callCustomerHref).toBe('tel:+919876543210');
    expect(panel!.whatsappHref).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
  });

  it('returns null for an unknown ref', async () => {
    expect(await loadOrderPanel(`NOPE-${tag}`)).toBeNull();
  });

  it('whatsapp href null for invalid phone', async () => {
    const { o } = await order('badphone', '123');
    const panel = await loadOrderPanel(o.ref);
    expect(panel!.whatsappHref).toBeNull();
  });
});
