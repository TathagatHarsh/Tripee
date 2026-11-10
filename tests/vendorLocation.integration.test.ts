import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const session = vi.hoisted(() => ({ current: null as null | { userId: string; profile: { id: string; role: string; vendorId: string | null } } }));
vi.mock('../lib/auth', () => ({
  getViewer: async () => session.current,
  requireAdmin: async () => ({ userId: 'test-admin', profile: { id: 'test-admin', role: 'ADMIN', vendorId: null } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }));
vi.mock('../lib/mapping', () => ({ getDistanceMatrix: async (origins: unknown[]) => origins.map(() => ({ distanceKm: 2, estimatedMinutes: 10, source: 'test' })) }));
import { db } from '../lib/db';
import { assignmentCandidates, manualAssignment } from '../lib/assignment';
import { POST as saveLocation } from '../app/api/vendor/location/route';
import { saveAssignmentRules } from '../app/admin/vendors/assignmentActions';

/* A bakery gets no orders until it places its own pin (docs: vendor location, 10 Nov 2026). */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = Date.now();
const asBakery = (vendorId: string) => { session.current = { userId: `u-${vendorId}`, profile: { id: `u-${vendorId}`, role: 'VENDOR', vendorId } }; };
const post = (body: unknown) => saveLocation(new Request('http://localhost/api/vendor/location', { method: 'POST', body: JSON.stringify(body) }));

async function unsetBakeryWithOrder() {
  const product = await db.cakeProduct.create({ data: { slug: `loc-${++serial}`, name: 'Location cake', description: 'Loc', category: 'chocolate', pricePaise: 100000, sizeBand: '1kg' } });
  /* Coordinates typed by the office, but never confirmed by the bakery. */
  const vendor = await db.vendor.create({ data: { name: `Location bakery ${serial}`, isAcceptingOrders: true, fulfillsAllProducts: true, latitude: 17.43, longitude: 78.4 } });
  await db.vendorInventory.create({ data: { vendorId: vendor.id, productId: product.id, productName: product.name, sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
  const order = await db.order.create({ data: { ref: `LOC-${serial}`, cakeProductId: product.id, config: { size: '1kg', eggless: true }, cakeName: product.name, status: 'confirmed', totalPaise: 100000, productSubtotalPaise: 100000, payablePaise: 100000, priceBreakdown: {}, deliverySlot: 'standard', leadHours: 24, dueAt: new Date(Date.now() + 86400000), deliveryLocation: { latitude: 17.431, longitude: 78.401 }, customerPhone: '+919876543210' } });
  return { vendor, order };
}
const row = async (ref: string, vendorId: string) => (await assignmentCandidates(ref)).find((r) => r.vendorId === vendorId)!;

describe.skipIf(!url)('bakery-set location on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it('an unset bakery is not offered orders, then is after saving its pin', async () => {
    const { vendor, order } = await unsetBakeryWithOrder();
    const before = await row(order.ref, vendor.id);
    expect(before.eligible).toBe(false);
    expect(before.reasons).toContain("Bakery hasn't set its location");
    await expect(manualAssignment(order.ref, vendor.id, null, null)).rejects.toThrow();

    asBakery(vendor.id);
    const res = await post({ lat: 17.4301, lng: 78.4001, radiusKm: 7, address: 'Road No. 1, Madhapur' });
    expect(res.status).toBe(200);
    const saved = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } });
    expect(saved.locationSetAt).not.toBeNull();
    expect([saved.latitude, saved.longitude, saved.serviceRadiusKm, saved.address]).toEqual([17.4301, 78.4001, 7, 'Road No. 1, Madhapur']);
    expect((await row(order.ref, vendor.id)).eligible).toBe(true);
    await manualAssignment(order.ref, vendor.id, null, null);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).currentAssignmentId).not.toBeNull();
  });

  it('refuses a radius outside 1–25 km, staff, and saving another bakery', async () => {
    const { vendor } = await unsetBakeryWithOrder();
    const other = await unsetBakeryWithOrder();
    asBakery(vendor.id);
    expect((await post({ lat: 17.43, lng: 78.4, radiusKm: 30 })).status).toBe(400);
    expect((await post({ lat: 17.43, lng: 78.4, radiusKm: 0 })).status).toBe(400);
    expect((await post({ lat: 17.43, lng: 78.4, radiusKm: 5, vendorId: other.vendor.id })).status).toBe(200);
    expect((await db.vendor.findUniqueOrThrow({ where: { id: other.vendor.id } })).locationSetAt).toBeNull();
    session.current = { userId: 'test-admin', profile: { id: 'test-admin', role: 'ADMIN', vendorId: null } };
    expect((await post({ lat: 17.43, lng: 78.4, radiusKm: 5 })).status).toBe(403);
    session.current = null;
    expect((await post({ lat: 17.43, lng: 78.4, radiusKm: 5 })).status).toBe(403);
  });

  it('an admin correction never counts as the bakery setting its location', async () => {
    const { vendor } = await unsetBakeryWithOrder();
    const form = new FormData();
    for (const [k, v] of Object.entries({ id: vendor.id, latitude: '17.44', longitude: '78.41', serviceRadiusKm: '12', maxConcurrentOrders: '10', commissionBps: '2000', assignmentFeePaise: '0', preparationMinutes: '120', locationSetAt: new Date().toISOString() })) form.set(k, v);
    form.set('isAcceptingOrders', 'on');
    form.set('fulfillsAllProducts', 'on');
    const result = await saveAssignmentRules(undefined, form);
    expect(result.ok).toBe(true);
    const saved = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } });
    expect([saved.latitude, saved.serviceRadiusKm, saved.locationSetAt]).toEqual([17.44, 12, null]);
    form.set('serviceRadiusKm', '40');
    expect((await saveAssignmentRules(undefined, form)).ok).toBe(false);
  });
});
