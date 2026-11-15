import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../lib/auth', () => ({ getViewer: async () => viewer.current }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }));
import { db } from '../lib/db';
import { POST } from '../app/api/inventory/route';

const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = Date.now();
const call = (body: unknown) => POST(new Request('http://localhost/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
async function cake() {
  const product = await db.cakeProduct.create({ data: { slug: `grid-${++serial}`, name: `Grid cake ${serial}`, description: 'Grid', category: 'chocolate', pricePaise: 100000, sizeBand: '1kg' } });
  for (const sizeBand of ['1kg', '2kg']) for (const eggType of ['egg', 'eggless'] as const)
    await db.cakeVariant.create({ data: { cakeId: product.id, sizeBand, eggType, pricePaise: 100000 } });
  return product;
}
async function bakery() {
  const vendor = await db.vendor.create({ data: { name: `Grid bakery ${++serial}`, isActive: false } });
  viewer.current = { userId: 'grid-admin', profile: { role: 'ADMIN' } };
  return vendor;
}
const rows = (vendorId: string) => db.vendorInventory.findMany({ where: { vendorId }, orderBy: [{ productId: 'asc' }, { sizeBand: 'asc' }, { eggType: 'asc' }] });
const grid = (vendorId: string, g: unknown[], version: string | null = null) => call({ vendorId, grid: g, version });

describe.skipIf(!url)('cake grid save, pause and resume on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  beforeEach(() => { viewer.current = null; });
  afterAll(async () => db.$disconnect());

  it('creates the wanted rows and logs each', async () => {
    const [v, c] = [await bakery(), await cake()];
    const res = await grid(v.id, [{ productId: c.id, sizes: ['1kg', '2kg'], egg: true, eggless: false }]);
    expect(res.status).toBe(200);
    const r = await rows(v.id);
    expect(r.map(x => `${x.sizeBand}/${x.eggType}/${x.isAvailable}`)).toEqual(['1kg/egg/true', '2kg/egg/true']);
    expect(r[0].productName).toBe(c.name);
    expect(await db.inventoryAvailabilityChange.count({ where: { inventoryId: { in: r.map(x => x.id) }, previousAvailable: null, newAvailable: true } })).toBe(2);
    expect((await res.json()).version).toBe((await db.vendorInventory.aggregate({ where: { vendorId: v.id }, _max: { updatedAt: true } }))._max.updatedAt!.toISOString());
  });

  it('unticking turns a row off and logs true to false', async () => {
    const [v, c] = [await bakery(), await cake()];
    const first = await (await grid(v.id, [{ productId: c.id, sizes: ['1kg', '2kg'], egg: true, eggless: false }])).json();
    const res = await grid(v.id, [{ productId: c.id, sizes: ['1kg'], egg: true, eggless: false }], first.version);
    expect(res.status).toBe(200);
    const off = (await rows(v.id)).find(x => x.sizeBand === '2kg')!;
    expect(off.isAvailable).toBe(false);
    expect(await db.inventoryAvailabilityChange.count({ where: { inventoryId: off.id, previousAvailable: true, newAvailable: false } })).toBe(1);
  });

  it('a stale version writes nothing and answers 409', async () => {
    const [v, c] = [await bakery(), await cake()];
    await grid(v.id, [{ productId: c.id, sizes: ['1kg'], egg: true, eggless: false }]);
    const before = await rows(v.id);
    const res = await grid(v.id, [{ productId: c.id, sizes: ['2kg'], egg: true, eggless: true }], '2000-01-01T00:00:00.000Z');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('This changed on another device. Reload to see the latest.');
    expect(await rows(v.id)).toEqual(before);
    // A vendor with nothing yet expects a null version.
    const empty = await bakery();
    expect((await grid(empty.id, [{ productId: c.id, sizes: ['1kg'], egg: true, eggless: false }], '2000-01-01T00:00:00.000Z')).status).toBe(409);
    expect(await rows(empty.id)).toHaveLength(0);
  });

  it('ignores rows for products not in the grid', async () => {
    const [v, a, b] = [await bakery(), await cake(), await cake()];
    const first = await (await grid(v.id, [{ productId: a.id, sizes: ['1kg'], egg: true, eggless: false }, { productId: b.id, sizes: ['1kg'], egg: true, eggless: false }])).json();
    const res = await grid(v.id, [{ productId: a.id, sizes: ['2kg'], egg: true, eggless: false }], first.version);
    expect(res.status).toBe(200);
    const orphan = (await rows(v.id)).find(x => x.productId === b.id)!;
    expect(orphan.isAvailable).toBe(true);
  });

  it('pauses by size across cakes, skips off rows, and logs pausedUntil', async () => {
    const [v, a, b] = [await bakery(), await cake(), await cake()];
    const both = { sizes: ['1kg', '2kg'], egg: true, eggless: false };
    const first = await (await grid(v.id, [{ productId: a.id, ...both }, { productId: b.id, ...both }])).json();
    await grid(v.id, [{ productId: b.id, sizes: ['2kg'], egg: true, eggless: false }], first.version);
    const res = await call({ vendorId: v.id, pause: { scope: { sizeBand: '2kg' }, length: 'tomorrow' } });
    expect(res.status).toBe(200);
    const r = await rows(v.id);
    const paused = r.filter(x => x.pausedUntil);
    expect(paused.map(x => `${x.productId === a.id ? 'a' : 'b'}/${x.sizeBand}`).sort()).toEqual(['a/2kg', 'b/2kg']);
    expect(r.find(x => x.productId === b.id && x.sizeBand === '1kg')!.pausedUntil).toBeNull();
    const log = await db.inventoryAvailabilityChange.findMany({ where: { inventoryId: paused[0].id, pausedUntil: { not: null } } });
    expect(log).toHaveLength(1);
    expect(log[0].pausedUntil).toEqual(paused[0].pausedUntil);
    expect((await res.json()).version).toBeTruthy();
  });

  it('pauses eggless and one cake by scope', async () => {
    const [v, a, b] = [await bakery(), await cake(), await cake()];
    const all = { sizes: ['1kg'], egg: true, eggless: true };
    await grid(v.id, [{ productId: a.id, ...all }, { productId: b.id, ...all }]);
    expect((await call({ vendorId: v.id, pause: { scope: { eggType: 'eggless' }, length: 'today' } })).status).toBe(200);
    expect((await rows(v.id)).filter(x => x.pausedUntil).map(x => x.eggType)).toEqual(['eggless', 'eggless']);
    await call({ vendorId: v.id, pause: { scope: { productId: a.id }, length: 'tomorrow' } });
    expect((await rows(v.id)).filter(x => x.pausedUntil && x.productId === a.id)).toHaveLength(2);
    expect((await rows(v.id)).filter(x => x.pausedUntil && x.productId === b.id)).toHaveLength(1);
  });

  it('rejects a past pause date with 400', async () => {
    const v = await bakery();
    expect((await call({ vendorId: v.id, pause: { scope: { sizeBand: '1kg' }, length: { date: '2020-01-01' } } })).status).toBe(400);
  });

  it('resume clears pausedUntil on the row and logs it', async () => {
    const [v, c] = [await bakery(), await cake()];
    await grid(v.id, [{ productId: c.id, sizes: ['1kg'], egg: true, eggless: false }]);
    await call({ vendorId: v.id, pause: { scope: { productId: c.id }, length: 'tomorrow' } });
    const row = (await rows(v.id))[0];
    expect(row.pausedUntil).not.toBeNull();
    const res = await call({ vendorId: v.id, resume: { ids: [row.id] } });
    expect(res.status).toBe(200);
    expect((await rows(v.id))[0].pausedUntil).toBeNull();
    expect(await db.inventoryAvailabilityChange.count({ where: { inventoryId: row.id, pausedUntil: null, previousAvailable: true, newAvailable: true } })).toBe(1);
  });

  it('a vendor cannot pause or resume another bakery', async () => {
    const [mine, other, c] = [await bakery(), await bakery(), await cake()];
    await grid(other.id, [{ productId: c.id, sizes: ['1kg'], egg: true, eggless: false }]);
    viewer.current = { userId: 'v', profile: { role: 'VENDOR', vendorId: mine.id } };
    expect((await call({ vendorId: other.id, pause: { scope: { productId: c.id }, length: 'today' } })).status).toBe(403);
    expect((await rows(other.id))[0].pausedUntil).toBeNull();
    // Own-vendor resume with a foreign id touches nothing.
    const foreign = (await rows(other.id))[0];
    await db.vendorInventory.update({ where: { id: foreign.id }, data: { pausedUntil: new Date(Date.now() + 1e7) } });
    await call({ vendorId: mine.id, resume: { ids: [foreign.id] } });
    expect((await rows(other.id))[0].pausedUntil).not.toBeNull();
  });
});
