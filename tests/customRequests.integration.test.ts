import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '../lib/db';
import { cancelCustomRequest, nextBakery, offerNext, runCustomRequestWorker } from '../lib/customRequests';
import { handleInbound } from '../lib/whatsappInbound';
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
      const v = await db.vendor.create({ data: { name: `CR Bakery ${i}`, phone: `91983330000${i}`, locationSetAt: opts.unset === i ? null : new Date(), isAcceptingOrders: true, fulfillsAllProducts: true, latitude: km(d), longitude: 77.6, serviceRadiusKm: 20, preparationMinutes: opts.prep ?? 60 } });
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

describe.skipIf(!url)('custom request lifecycle over WhatsApp on isolated PostgreSQL', () => {
  const ADMIN = '919000000001', CUSTOMER = '919822200000';
  const phoneOf = (i: number) => `91981110000${i}`;
  const lat = (k: number) => 13.6 + k / 111.19; // a corner of its own, away from the nextBakery suite
  const ids: string[] = [], vIds: string[] = [];
  const sent = vi.fn();
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'secret'); vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '9000000001');
    sent.mockReset(); sent.mockResolvedValue({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', sent);
  });
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
    await db.customRequest.deleteMany({ where: { id: { in: ids } } });
    await db.whatsAppCommand.deleteMany({ where: { vendorId: { in: vIds } } });
    await db.vendor.deleteMany({ where: { id: { in: vIds } } });
    ids.length = vIds.length = 0;
  });
  async function fixture(opts: { phone?: string } = {}) {
    const vendors: Awaited<ReturnType<typeof db.vendor.create>>[] = [];
    for (const [i, d] of [0.1, 1, 2, 3].entries()) {
      const v = await db.vendor.create({ data: { name: `CR Life ${i}`, phone: phoneOf(i), locationSetAt: new Date(), isAcceptingOrders: true, fulfillsAllProducts: true, latitude: lat(d), longitude: 77.6, serviceRadiusKm: 20, preparationMinutes: 60 } });
      vIds.push(v.id); vendors.push(v);
    }
    const n = ++serial;
    const request = await db.customRequest.create({ data: { ref: `CR-L${Date.now()}${n}`, token: `tokl-${Date.now()}-${n}`, name: 'Asha', phone: opts.phone ?? CUSTOMER, photoUrl: 'https://x.test/p.jpg', sizeKg: 1.5, flavour: 'Chocolate', dueAt: new Date(Date.now() + 48 * 3600000), address: { lat: 13.6, lng: 77.6, address: '12 Secret Street', locality: 'Kondapur', city: 'Hyderabad', state: 's', pincode: '500001', placeId: 'p' } } });
    ids.push(request.id);
    return { vendors, request };
  }
  const rows = (id: string) => db.notificationOutbox.findMany({ where: { customRequestId: id }, orderBy: { createdAt: 'asc' } });
  const reload = (id: string) => db.customRequest.findUniqueOrThrow({ where: { id } });
  const textOf = (r: { payload: unknown }) => JSON.stringify(r.payload);
  const expireOffer = (id: string) => db.customRequest.update({ where: { id }, data: { offerExpiresAt: new Date(Date.now() - 1000) } });
  const quoted = async (opts?: { phone?: string }) => {
    const f = await fixture(opts); await offerNext(f.request.id);
    await handleInbound({ id: `wamid.q${f.request.id}`, from: phoneOf(0), text: '1800' });
    return f;
  };

  it('offers the nearest bakery the custom_offer template with the area only', async () => {
    const { vendors, request } = await fixture();
    await offerNext(request.id);
    const r = await reload(request.id);
    expect(r.vendorId).toBe(vendors[0].id); expect(r.triedVendorIds).toEqual([vendors[0].id]);
    expect(r.offerExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 60000);
    const [offer] = await rows(request.id);
    expect(offer).toMatchObject({ destination: phoneOf(0), kind: 'custom_request', dedupeKey: `cr:${request.id}:offer:${vendors[0].id}:${phoneOf(0)}` });
    expect(offer.payload).toMatchObject({ type: 'template', name: 'custom_offer' });
    expect(textOf(offer)).toContain('Kondapur'); expect(textOf(offer)).not.toContain('Secret'); expect(textOf(offer)).not.toContain('Asha');
  });
  it('a typed "1800" quotes: customer price with margin, customer template, bakery reply', async () => {
    const { request } = await quoted();
    const r = await reload(request.id);
    expect(r).toMatchObject({ status: 'quoted', vendorQuotePaise: 180000, quotePaise: 207000 });
    expect(r.quoteExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    const all = await rows(request.id);
    expect(all.find(x => x.destination === CUSTOMER)!.payload).toMatchObject({ type: 'template', name: 'custom_quote' });
    expect(all.some(x => x.destination === ADMIN)).toBe(true);
    const reply = all.find(x => x.dedupeKey === `wa-reply:wamid.q${request.id}:${phoneOf(0)}`)!;
    expect(reply.payload).toEqual({ type: 'text', body: `✅ Quote ₹1,800 sent for ${request.ref}. We'll tell you if the customer pays.` });
  });
  it('the Can\'t do it button passes the request to the second bakery', async () => {
    const { vendors, request } = await fixture(); await offerNext(request.id);
    await handleInbound({ id: 'wamid.cqno', from: phoneOf(0), payload: `cq_no:${request.id}` });
    const r = await reload(request.id);
    expect(r.vendorId).toBe(vendors[1].id); expect(r.triedVendorIds).toEqual([vendors[0].id, vendors[1].id]);
    expect((await rows(request.id)).some(x => x.destination === phoneOf(1) && (x.payload as { name?: string }).name === 'custom_offer')).toBe(true);
  });
  it('typed "can\'t do it CR-…" also declines', async () => {
    const { vendors, request } = await fixture(); await offerNext(request.id);
    await handleInbound({ id: 'wamid.cant', from: phoneOf(0), text: `Can't do it ${request.ref}` });
    expect((await reload(request.id)).vendorId).toBe(vendors[1].id);
  });
  it('expired offers move to the next bakery up to three, then no_bakery with an admin alert', async () => {
    const { vendors, request } = await fixture(); await offerNext(request.id);
    for (const next of [1, 2]) {
      await expireOffer(request.id); await runCustomRequestWorker();
      expect((await reload(request.id)).vendorId).toBe(vendors[next].id);
    }
    expect(textOf((await rows(request.id)).find(x => x.destination === phoneOf(0) && x.dedupeKey.startsWith(`cr:${request.id}:passed`))!)).toContain('has been passed on');
    await expireOffer(request.id); await runCustomRequestWorker();
    const r = await reload(request.id);
    expect(r.status).toBe('no_bakery'); expect(r.triedVendorIds).toHaveLength(3);
    const alert = (await rows(request.id)).find(x => x.destination === ADMIN)!;
    expect(textOf(alert)).toContain('No bakery could quote this custom cake. Customer: Asha 919822200000');
    expect((await rows(request.id)).some(x => x.destination === phoneOf(3))).toBe(false);
  });
  it('a quote after the offer expired changes nothing and says the request is not waiting', async () => {
    const { request } = await fixture(); await offerNext(request.id); await expireOffer(request.id);
    await handleInbound({ id: 'wamid.late', from: phoneOf(0), text: '1800' });
    expect((await reload(request.id)).status).toBe('awaiting_quote');
    const reply = (await rows(request.id)).find(x => x.dedupeKey.startsWith('wa-reply:wamid.late:'))!;
    expect(textOf(reply)).toContain("isn't waiting");
  });
  it('a quote too close to the delivery time is not sent to the customer and the request moves on', async () => {
    const { request } = await fixture(); await offerNext(request.id);
    await db.customRequest.update({ where: { id: request.id }, data: { dueAt: new Date(Date.now() + 30 * 60000) } });
    await handleInbound({ id: 'wamid.close', from: phoneOf(0), text: '1800' });
    const r = await reload(request.id);
    expect(r.status).toBe('no_bakery'); expect(r.quotePaise).toBeNull();
    const all = await rows(request.id);
    expect(all.some(x => x.destination === CUSTOMER)).toBe(false);
    expect(textOf(all.find(x => x.dedupeKey.startsWith('wa-reply:wamid.close:'))!)).toContain('too soon');
  });
  it('the same message id delivered twice quotes once and replies once', async () => {
    const { request } = await fixture(); await offerNext(request.id);
    for (let i = 0; i < 2; i++) await handleInbound({ id: 'wamid.twice', from: phoneOf(0), text: '₹1,800' });
    const all = await rows(request.id);
    expect(all.filter(x => x.destination === CUSTOMER)).toHaveLength(1);
    expect(all.filter(x => x.dedupeKey.startsWith('wa-reply:wamid.twice:'))).toHaveLength(1);
    expect(sent).not.toHaveBeenCalled();
  });
  it('an out-of-range price gets the rupees hint', async () => {
    const { request } = await fixture(); await offerNext(request.id);
    await handleInbound({ id: 'wamid.tiny', from: phoneOf(0), text: '50' });
    expect((await reload(request.id)).status).toBe('awaiting_quote');
    expect(JSON.parse(sent.mock.calls[0][1].body).text.body).toBe('Please send the price in rupees, e.g. 1800.');
  });
  it('the customer taps Not for me: declined, admin and the quoting bakery told', async () => {
    const { request } = await quoted();
    await handleInbound({ id: 'wamid.nfm', from: CUSTOMER, text: 'Not for me', payload: `cq_decline:${request.id}` });
    expect((await reload(request.id)).status).toBe('declined');
    const all = await rows(request.id);
    expect(textOf(all.filter(x => x.destination === CUSTOMER).at(-1)!)).toContain('No problem — our team may message you.');
    expect(all.filter(x => x.destination === ADMIN).length).toBeGreaterThanOrEqual(2);
    expect(textOf(all.filter(x => x.destination === phoneOf(0)).at(-1)!)).toContain(`The customer passed on ${request.ref}`);
    expect(sent).not.toHaveBeenCalled();
  });
  it('any other customer text goes to the admin only', async () => {
    const { request } = await quoted();
    const toVendor = (await rows(request.id)).filter(x => x.destination === phoneOf(0)).length;
    await handleInbound({ id: 'wamid.haggle', from: CUSTOMER, text: 'can you do 1500?' });
    const all = await rows(request.id);
    expect(textOf(all.at(-1)!)).toContain(`Customer on ${request.ref} says: can you do 1500?`);
    expect(all.at(-1)!.destination).toBe(ADMIN);
    expect(all.filter(x => x.destination === phoneOf(0))).toHaveLength(toVendor);
    expect((await reload(request.id)).status).toBe('quoted');
    expect(sent).not.toHaveBeenCalled();
  });
  it('a number that is both a bakery and a customer quoting "1800" is the bakery quoting', async () => {
    const { request } = await quoted({ phone: phoneOf(0) });
    expect((await reload(request.id)).status).toBe('quoted');
  });
  it('an expired quote becomes expired on the worker run', async () => {
    const { request } = await quoted();
    await db.customRequest.update({ where: { id: request.id }, data: { quoteExpiresAt: new Date(Date.now() - 1000) } });
    expect((await runCustomRequestWorker()).quotes).toBeGreaterThanOrEqual(1);
    expect((await reload(request.id)).status).toBe('expired');
  });
  it('skips a nearest bakery with no WhatsApp number', async () => {
    const { vendors, request } = await fixture();
    await db.vendor.update({ where: { id: vendors[0].id }, data: { phone: null } });
    await offerNext(request.id);
    expect((await reload(request.id)).vendorId).toBe(vendors[1].id);
  });
  it('the worker offers a request whose first offer never went out', async () => {
    const { vendors, request } = await fixture();
    await runCustomRequestWorker();
    expect((await reload(request.id)).vendorId).toBeNull(); // a just-created request is not raced
    await db.customRequest.update({ where: { id: request.id }, data: { createdAt: new Date(Date.now() - 2 * 60000) } });
    await runCustomRequestWorker();
    expect((await reload(request.id)).vendorId).toBe(vendors[0].id);
  });
  it('cancel stops an open offer and tells the bakery', async () => {
    const { request } = await fixture(); await offerNext(request.id);
    expect(await cancelCustomRequest(request.id)).toBe(true);
    expect((await reload(request.id)).status).toBe('cancelled');
    expect(textOf((await rows(request.id)).at(-1)!)).toContain('cancelled');
    expect(await cancelCustomRequest(request.id)).toBe(false);
  });
});
