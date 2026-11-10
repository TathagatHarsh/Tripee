import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '../lib/db';
import { nextBakery } from '../lib/customRequests';
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
const vendorIds: string[] = [], requestIds: string[] = [];
let serial = 0;
// own corner of the map so other suites' bakeries sharing the scratch DB never compete
const km = (k: number) => 12.9 + k / 111.19; // degrees of latitude per km
describe.skipIf(!url)('nextBakery on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterEach(async () => {
    await db.customRequest.deleteMany({ where: { id: { in: requestIds } } });
    await db.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    vendorIds.length = requestIds.length = 0;
  });
  afterAll(async () => { await db.$disconnect(); });
  async function fixture(opts: { prep?: number; dueInHours?: number; tried?: number[]; unset?: number } = {}) {
    const vendors: Awaited<ReturnType<typeof db.vendor.create>>[] = [];
    for (const [i, d] of [0.1, 1, 30].entries()) {
      const v = await db.vendor.create({ data: { name: `CR Bakery ${i}`, locationSetAt: opts.unset === i ? null : new Date(), isAcceptingOrders: true, fulfillsAllProducts: true, latitude: km(d), longitude: 77.6, serviceRadiusKm: 20, preparationMinutes: opts.prep ?? 60 } });
      vendorIds.push(v.id); vendors.push(v);
    }
    const n = ++serial;
    const request = await db.customRequest.create({ data: { ref: `CR-T${Date.now()}${n}`, token: `tok-${Date.now()}-${n}`, name: 'T', phone: '919000000000', photoUrl: 'x', sizeKg: 1, flavour: 'f', dueAt: new Date(Date.now() + (opts.dueInHours ?? 48) * 3600000), address: { lat: 12.9, lng: 77.6, address: 'a', city: 'c', state: 's', pincode: '500001', placeId: 'p' }, triedVendorIds: (opts.tried ?? []).map(i => vendors[i].id) } });
    requestIds.push(request.id);
    return { vendors, request };
  }
  it('returns the nearest bakery', async () => {
    const { vendors, request } = await fixture();
    expect((await nextBakery(db, request))?.vendor.id).toBe(vendors[0].id);
  });
  it('skips tried bakeries', async () => {
    const { vendors, request } = await fixture({ tried: [0] });
    expect((await nextBakery(db, request))?.vendor.id).toBe(vendors[1].id);
  });
  it('returns null once only the 30 km bakery is left', async () => {
    const { request } = await fixture({ tried: [0, 1] });
    expect(await nextBakery(db, request)).toBeNull();
  });
  it('skips a bakery without a location', async () => {
    const { vendors, request } = await fixture({ unset: 0 });
    expect((await nextBakery(db, request))?.vendor.id).toBe(vendors[1].id);
  });
  it('returns null when no bakery can prepare in time', async () => {
    const { request } = await fixture({ prep: 240, dueInHours: 1 });
    expect(await nextBakery(db, request)).toBeNull();
  });
});
