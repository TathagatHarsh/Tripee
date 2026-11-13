import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const afterCallbacks: (() => unknown)[] = [];
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { afterCallbacks.push(fn); } }));
vi.mock('../lib/storage', () => ({ optimize: async (b: Buffer) => b, store: async (_b: Buffer, _c: string, ref: string) => `https://blob.test/${ref}.webp` }));
// The real refund, watched: the concurrency test must see it is never asked for.
vi.mock('../lib/checkoutPayment', async (orig) => {
  const actual = await orig<typeof import('../lib/checkoutPayment')>();
  return { ...actual, refundPayment: vi.fn(actual.refundPayment) };
});
import { createHmac } from 'node:crypto';
import { db } from '../lib/db';
import { openPaymentIntent, refundPayment } from '../lib/checkoutPayment';
import { cancelCustomRequest, createCustomRequest, nextBakery, offerNext, payCustomRequest, runCustomRequestWorker } from '../lib/customRequests';
import { recoverPayment } from '../lib/paymentRecovery';
import { durableRefund } from '../lib/refunds';
import { POST as openQuoteIntent } from '../app/api/custom-requests/[token]/intent/route';
import { POST as payQuote } from '../app/api/custom-requests/[token]/pay/route';
import { handleInbound } from '../lib/whatsappInbound';
import { vendorOrder } from '../app/vendor/data';
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
  async function fixture(opts: { phone?: string; locality?: string } = {}) {
    const vendors: Awaited<ReturnType<typeof db.vendor.create>>[] = [];
    for (const [i, d] of [0.1, 1, 2, 3].entries()) {
      const v = await db.vendor.create({ data: { name: `CR Life ${i}`, phone: phoneOf(i), locationSetAt: new Date(), isAcceptingOrders: true, fulfillsAllProducts: true, latitude: lat(d), longitude: 77.6, serviceRadiusKm: 20, preparationMinutes: 60 } });
      vIds.push(v.id); vendors.push(v);
    }
    const n = ++serial;
    const request = await db.customRequest.create({ data: { ref: `CR-L${Date.now()}${n}`, token: `tokl-${Date.now()}-${n}`, name: 'Asha', phone: opts.phone ?? CUSTOMER, photoUrl: 'https://x.test/p.jpg', sizeKg: 1.5, flavour: 'Chocolate', dueAt: new Date(Date.now() + 48 * 3600000), address: { lat: 13.6, lng: 77.6, address: '12 Secret Street', locality: opts.locality ?? 'Kondapur', city: 'Hyderabad', state: 's', pincode: '500001', placeId: 'p' } } });
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
    // The stored photo is WebP; WhatsApp gets it through the signed JPEG converter, never the blob URL.
    const link = (offer.payload as { components: { type: string; parameters: { image?: { link: string } }[] }[] }).components[0].parameters[0].image!.link;
    expect(link).toContain(`/api/whatsapp/photo/${request.id}?s=`); expect(textOf(offer)).not.toContain('x.test/p.jpg');
  });
  it('a blank locality falls back to the city for the offer area', async () => {
    const { request } = await fixture({ locality: '' });
    await offerNext(request.id);
    const [offer] = await rows(request.id);
    expect(textOf(offer)).toContain('"text":"Hyderabad"');
  });
  it('a typed "1800" quotes: customer price with margin, customer template, bakery reply', async () => {
    const { request } = await quoted();
    const r = await reload(request.id);
    expect(r).toMatchObject({ status: 'quoted', vendorQuotePaise: 180000, quotePaise: 222000 });
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
  it('cancel on a quoted request tells the bakery; a paid one is left alone', async () => {
    const { request } = await quoted();
    expect(await cancelCustomRequest(request.id)).toBe(true);
    expect((await reload(request.id)).status).toBe('cancelled');
    expect(textOf((await rows(request.id)).at(-1)!)).toContain(`${request.ref} was cancelled`);
    await db.customRequest.update({ where: { id: request.id }, data: { status: 'paid' } });
    const n = (await rows(request.id)).length;
    expect(await cancelCustomRequest(request.id)).toBe(false);
    expect((await reload(request.id)).status).toBe('paid');
    expect((await rows(request.id)).length).toBe(n);
  });
});

describe.skipIf(!url)('createCustomRequest on isolated PostgreSQL', () => {
  const made: string[] = [];
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterEach(async () => { await db.customRequest.deleteMany({ where: { ref: { in: made } } }); made.length = 0; afterCallbacks.length = 0; });
  const input = { name: 'Asha', phone: '98765 43210', sizeKg: 1.5, budgetRupees: 2000, flavour: 'Chocolate', dueAt: new Date(Date.now() + 3 * 86400000).toISOString(), consent: true as const,
    address: { lat: 17.4, lng: 78.45, address: 'Road 1', locality: 'Banjara Hills', city: 'Hyderabad', state: 'Telangana', pincode: '500034', placeId: 'p' } };
  it('stores the row with a CR- ref and a normalized phone, and offers it after the response', async () => {
    const { ref } = await createCustomRequest(input, Buffer.from('img')); made.push(ref);
    expect(ref).toMatch(/^CR-[A-Z2-7]{6}$/);
    const row = await db.customRequest.findUniqueOrThrow({ where: { ref } });
    expect(row).toMatchObject({ status: 'awaiting_quote', phone: '919876543210', budgetPaise: 200000, photoUrl: `https://blob.test/${ref}.webp`, flavour: 'Chocolate' });
    expect(row.sizeKg.toString()).toBe('1.5');
    expect(afterCallbacks).toHaveLength(1); // offerNext is scheduled, not yet run
    await afterCallbacks[0]();
    expect((await db.customRequest.findUniqueOrThrow({ where: { ref } })).offerExpiresAt !== null || (await db.customRequest.findUniqueOrThrow({ where: { ref } })).status === 'no_bakery').toBe(true);
  });
});

describe.skipIf(!url)('paying a custom quote on isolated PostgreSQL', () => {
  const ADMIN = '919000000001', CUSTOMER = '919833300000';
  const run = `${Date.now()}`;
  const ids: string[] = [], vIds: string[] = [];
  const fetchMock = vi.fn();
  const gatewayOrders = new Map<string, { receipt: string; amount: number }>();
  const paymentOrder = new Map<string, string>();
  const refundCalls = (paymentId = '') => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(`${paymentId}/refund`)).length;
  let refundStatus = 200;
  let refundState = 'processed';
  const sign = (o: string, p: string) => createHmac('sha256', 'secret').update(`${o}|${p}`).digest('hex');
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'secret'); vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '9000000001');
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc'); vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    vi.mocked(refundPayment).mockClear();
    refundStatus = 200; refundState = 'processed';
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: unknown, init?: { body?: string }) => {
      const target = String(input);
      if (target.endsWith('/v1/orders')) {
        const { receipt, amount } = JSON.parse(init!.body!);
        const id = `order_CP${run}${gatewayOrders.size}`;
        gatewayOrders.set(id, { receipt, amount });
        return Response.json({ id });
      }
      if (target.endsWith('/refund')) {
        const pay = target.split('/').at(-2)!;
        return Response.json({ id: `rfnd_${pay}`, payment_id: pay, status: refundState }, { status: refundStatus });
      }
      const order = /\/orders\/(order_\w+)$/.exec(target)?.[1];
      if (order) return Response.json({ id: order, receipt: gatewayOrders.get(order)!.receipt, amount: gatewayOrders.get(order)!.amount, currency: 'INR' });
      const pay = /\/payments\/(pay_\w+)$/.exec(target)?.[1];
      if (pay) {
        const o = paymentOrder.get(pay)!;
        return Response.json({ id: pay, order_id: o, status: 'captured', amount: gatewayOrders.get(o)!.amount, amount_refunded: 0, currency: 'INR' });
      }
      throw new Error(`unexpected fetch ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
    await db.order.deleteMany({ where: { razorpayPaymentId: { startsWith: `pay_CP${run}` } } });
    await db.customRequest.deleteMany({ where: { id: { in: ids } } });
    await db.checkoutAttempt.deleteMany({ where: { id: { in: ids.map((id) => `custom:${id}`) } } });
    await db.refundOperation.deleteMany({ where: { paymentId: { startsWith: `pay_CP${run}` } } });
    await db.vendor.deleteMany({ where: { id: { in: vIds } } });
    ids.length = vIds.length = 0;
  });

  /** A request quoted ₹1,800 by one bakery (₹2,070 to the customer), its intent opened, and a signed payment for it. */
  async function paidQuote(opts: { expired?: boolean; inactive?: boolean } = {}) {
    const n = ++serial;
    const vendorPhone = `9198555${String(n).padStart(5, '0')}`;
    const vendor = await db.vendor.create({ data: { name: `CR Pay ${n}`, phone: vendorPhone, isActive: !opts.inactive, locationSetAt: new Date(), latitude: 14.2, longitude: 77.6, serviceRadiusKm: 20, preparationMinutes: 60 } });
    vIds.push(vendor.id);
    const request = await db.customRequest.create({ data: {
      ref: `CR-P${run}${n}`, token: `tokp-${run}-${n}`, status: 'quoted', name: 'Asha', phone: CUSTOMER, photoUrl: 'https://x.test/p.jpg',
      sizeKg: 1.5, flavour: 'Chocolate', cakeMessage: 'Happy 30th', budgetPaise: 200000,
      dueAt: new Date(Date.now() + 48 * 3600000), createdAt: new Date(Date.now() - 2 * 3600000),
      address: { lat: 14.2, lng: 77.6, address: '12 Secret Street', locality: 'Kondapur', city: 'Hyderabad', state: 'Telangana', pincode: '500084', placeId: 'p' },
      vendorId: vendor.id, triedVendorIds: [vendor.id], vendorQuotePaise: 180000, quotePaise: 222000,
      quoteExpiresAt: new Date(Date.now() + (opts.expired ? -1 : 1) * 3600000),
    } });
    ids.push(request.id);
    const intent = await openPaymentIntent(`custom:${request.id}`, `custom:${request.id}`, 222000);
    if (intent.kind !== 'ok') throw new Error('no intent');
    const razorpayPaymentId = `pay_CP${run}${n}`;
    paymentOrder.set(razorpayPaymentId, intent.record.razorpayOrderId);
    const proof = { razorpayOrderId: intent.record.razorpayOrderId, razorpayPaymentId, razorpaySignature: sign(intent.record.razorpayOrderId, razorpayPaymentId) };
    return { vendor, vendorPhone, request, proof };
  }
  const reload = (id: string) => db.customRequest.findUniqueOrThrow({ where: { id } });
  const ordersFor = (paymentId: string) => db.order.count({ where: { razorpayPaymentId: paymentId } });

  it('turns a paid quote into a confirmed order accepted by the quoting bakery', async () => {
    const { vendor, vendorPhone, request, proof } = await paidQuote();
    const result = await payCustomRequest(request.id, proof);
    expect(result).toMatchObject({ kind: 'paid', orderRef: expect.stringMatching(/^MC-/) });
    const ref = (result as { orderRef: string }).orderRef;
    const order = await db.order.findUniqueOrThrow({ where: { ref }, include: { assignments: true, items: true, events: true } });
    expect(order).toMatchObject({
      totalPaise: 222000, payablePaise: 222000, productSubtotalPaise: 207000, deliveryFeePaise: 15000, status: 'confirmed', paymentStatus: 'paid',
      razorpayOrderId: proof.razorpayOrderId, razorpayPaymentId: proof.razorpayPaymentId, assignmentState: 'ASSIGNED',
      cakeName: 'Custom cake · 1.5 kg · Chocolate', cakeImageUrl: 'https://x.test/p.jpg', customerName: 'Asha', customerPhone: CUSTOMER,
      addressLine1: '12 Secret Street', city: 'Hyderabad', state: 'Telangana', pincode: '500084', customerNotes: 'Happy 30th',
      deliverySlot: 'custom', leadHours: 50, dueAt: request.dueAt, requestedFor: request.dueAt, requestedWindow: null,
    });
    expect(order.config).toEqual({ custom: true, sizeKg: 1.5, flavour: 'Chocolate', cakeMessage: 'Happy 30th', budgetPaise: 200000 });
    expect(order.priceBreakdown).toEqual({ custom: { vendorQuotePaise: 180000, quotePaise: 222000, deliveryFeePaise: 15000 } });
    expect(order.deliveryLocation).toEqual({ latitude: 14.2, longitude: 77.6 });
    expect(order.items).toMatchObject([{ label: 'Custom cake · 1.5 kg · Chocolate', amountPaise: 207000 }]);
    // The bakery portal: no designer config, but flagged custom so it doesn't say "Specification unavailable".
    expect(await vendorOrder(vendor.id, ref)).toMatchObject({ config: null, custom: true, order: { cakeName: 'Custom cake · 1.5 kg · Chocolate', customerNotes: 'Happy 30th' } });
    expect(order.events).toMatchObject([{ fromStatus: 'draft', toStatus: 'confirmed' }]);
    expect(order.assignments).toHaveLength(1);
    const [assignment] = order.assignments;
    expect(order.currentAssignmentId).toBe(assignment.id);
    expect(assignment).toMatchObject({ vendorId: vendor.id, assignmentStatus: 'ACCEPTED', status: 'accepted', sequence: 0,
      orderValuePaise: 222000, vendorEarningPaise: 180000, commissionPaise: 27000, feePaise: 0 });
    expect(await reload(request.id)).toMatchObject({ status: 'paid', orderId: order.id });
    expect(await db.checkoutAttempt.findUnique({ where: { id: `custom:${request.id}` } })).toMatchObject({ status: 'completed', orderId: order.id });
    const rows = await db.notificationOutbox.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.some((r) => r.destination === CUSTOMER)).toBe(true);
    expect(rows.some((r) => r.destination === ADMIN)).toBe(true);
    const toBakery = rows.filter((r) => r.destination === vendorPhone).map((r) => r.payload);
    expect(toBakery).toEqual([expect.objectContaining({
      type: 'buttons', body: `✅ Customer paid — ${request.ref} is now order ${ref}. Tap each step as you go.`,
      buttons: expect.arrayContaining([{ id: `start:${assignment.id}`, title: 'Started' }]),
    })]);
    expect(refundPayment).not.toHaveBeenCalled();
  });
  it('the same payment again is already paid, still one order', async () => {
    const { request, proof } = await paidQuote();
    expect((await payCustomRequest(request.id, proof)).kind).toBe('paid');
    expect(await payCustomRequest(request.id, proof)).toEqual({ kind: 'already_paid' });
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(1);
    expect(refundPayment).not.toHaveBeenCalled();
  });
  it('two simultaneous confirmations make exactly one order and refund nothing', async () => {
    const { request, proof } = await paidQuote();
    const results = await Promise.all([payCustomRequest(request.id, proof), payCustomRequest(request.id, proof)]);
    expect(results.map((r) => r.kind).sort()).toEqual(['already_paid', 'paid']);
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(1);
    expect(refundPayment).not.toHaveBeenCalled();
    expect(refundCalls()).toBe(0);
  });
  it('a payment after the quote expired is refunded and makes no order', async () => {
    const { request, proof } = await paidQuote({ expired: true });
    expect(await payCustomRequest(request.id, proof)).toEqual({ kind: 'refunded' });
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(0);
    expect((await reload(request.id)).status).toBe('expired');
    expect(refundCalls()).toBe(1);
  });
  it('a payment after the quoting bakery was deactivated is refunded, cancelled and the admin told', async () => {
    const { request, proof } = await paidQuote({ inactive: true });
    expect(await payCustomRequest(request.id, proof)).toEqual({ kind: 'refunded' });
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(0);
    expect((await reload(request.id)).status).toBe('cancelled');
    expect(refundCalls()).toBe(1);
    const alerts = await db.notificationOutbox.findMany({ where: { customRequestId: request.id, destination: ADMIN } });
    expect(JSON.stringify(alerts.map((a) => a.payload))).toContain('refunded');
  });
  it('a genuine payment for some other Razorpay order buys nothing and is not refunded', async () => {
    const { request, proof } = await paidQuote();
    const foreign = { ...proof, razorpayOrderId: `order_CP${run}elsewhere`, razorpaySignature: sign(`order_CP${run}elsewhere`, proof.razorpayPaymentId) };
    expect(await payCustomRequest(request.id, foreign)).toEqual({ kind: 'unmatched' });
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(0);
    expect((await reload(request.id)).status).toBe('quoted');
    expect(refundPayment).not.toHaveBeenCalled();
  });
  it('the Razorpay webhook recovery routes a custom: receipt to the custom payment', async () => {
    const { request, proof } = await paidQuote();
    await recoverPayment(proof.razorpayPaymentId);
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(1);
    expect((await reload(request.id)).status).toBe('paid');
    await recoverPayment(proof.razorpayPaymentId); // a redelivered webhook
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(1);
    expect(refundCalls()).toBe(0);
  });
  const call = (route: typeof payQuote, token: string, body?: unknown) =>
    route(new Request(`http://localhost/api/custom-requests/${token}/x`, { method: 'POST', body: JSON.stringify(body ?? {}) }), { params: Promise.resolve({ token }) });
  it('the routes: intent for a live quote, 400 for a forged proof, the order for a real one even after the webhook made it', async () => {
    const { request, proof } = await paidQuote();
    const intent = await call(openQuoteIntent, request.token);
    expect(await intent.json()).toEqual({ razorpayOrderId: proof.razorpayOrderId, amountPaise: 222000, keyId: 'rzp_test_abc' });
    expect((await call(payQuote, request.token, { ...proof, razorpaySignature: 'f'.repeat(64) })).status).toBe(400);
    await recoverPayment(proof.razorpayPaymentId); // the webhook wins the race
    const res = await call(payQuote, request.token, proof);
    expect(res.status).toBe(200);
    const { orderRef } = await res.json();
    expect(await db.order.findUnique({ where: { razorpayPaymentId: proof.razorpayPaymentId }, select: { ref: true } })).toEqual({ ref: orderRef });
    expect((await call(openQuoteIntent, request.token)).status).toBe(409); // paid: no second intent
  });
  /** Another payment captured on the same Razorpay order (a second tab, a late UPI authorisation). */
  const secondPayment = (proof: { razorpayOrderId: string; razorpayPaymentId: string }) => {
    const razorpayPaymentId = `${proof.razorpayPaymentId}b`;
    paymentOrder.set(razorpayPaymentId, proof.razorpayOrderId);
    return { razorpayOrderId: proof.razorpayOrderId, razorpayPaymentId, razorpaySignature: sign(proof.razorpayOrderId, razorpayPaymentId) };
  };
  for (const status of ['declined', 'cancelled'] as const)
    it(`a payment for a ${status} request is refunded and makes no order`, async () => {
      const { request, proof } = await paidQuote();
      await db.customRequest.update({ where: { id: request.id }, data: { status } });
      expect(await payCustomRequest(request.id, proof)).toEqual({ kind: 'refunded' });
      expect(await ordersFor(proof.razorpayPaymentId)).toBe(0);
      expect((await reload(request.id)).status).toBe(status);
      expect(refundCalls(proof.razorpayPaymentId)).toBe(1);
    });
  it('a second payment after the first bought the order is refunded, the order untouched', async () => {
    const { request, proof } = await paidQuote();
    const first = await payCustomRequest(request.id, proof);
    expect(first.kind).toBe('paid');
    const p2 = secondPayment(proof);
    expect(await payCustomRequest(request.id, p2)).toEqual({ kind: 'refunded' });
    expect(refundCalls(p2.razorpayPaymentId)).toBe(1);
    expect(refundCalls(proof.razorpayPaymentId)).toBe(0);
    expect(await db.order.findUniqueOrThrow({ where: { razorpayPaymentId: proof.razorpayPaymentId } })).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
    expect(await ordersFor(p2.razorpayPaymentId)).toBe(0);
    expect((await reload(request.id)).status).toBe('paid');
  });
  it('the webhook refunds a payment on this quote\'s Razorpay order after a refund cleared the binding', async () => {
    const { request, proof } = await paidQuote({ expired: true });
    expect(await payCustomRequest(request.id, proof)).toEqual({ kind: 'refunded' }); // clears the binding
    const p2 = secondPayment(proof);
    expect(await payCustomRequest(request.id, p2)).toEqual({ kind: 'unmatched' }); // the pay route alone can't tell it is ours
    await recoverPayment(p2.razorpayPaymentId);
    expect(refundPayment).toHaveBeenLastCalledWith(expect.objectContaining({ razorpayOrderId: p2.razorpayOrderId, razorpayPaymentId: p2.razorpayPaymentId }));
    expect(refundCalls(p2.razorpayPaymentId)).toBe(1);
    expect(await ordersFor(p2.razorpayPaymentId)).toBe(0);
  });
  it('a refund that errors but is recorded is "being refunded": the webhook acknowledges and reconcileRefunds finishes it', async () => {
    const { request, proof } = await paidQuote({ expired: true });
    refundStatus = 500;
    const res = await call(payQuote, request.token, proof);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ refunded: true, error: expect.stringContaining('being refunded') });
    await expect(recoverPayment(proof.razorpayPaymentId)).resolves.toBeUndefined(); // no 503 storm
    expect(await db.refundOperation.findUnique({ where: { paymentId: proof.razorpayPaymentId } })).toMatchObject({ status: 'pending', lastError: expect.stringContaining('500') });
    refundStatus = 200;
    await durableRefund(proof.razorpayPaymentId); // what reconcileRefunds runs for a due row
    expect(await db.refundOperation.findUnique({ where: { paymentId: proof.razorpayPaymentId } })).toMatchObject({ status: 'processed' });
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(0);
  });
  it('a Razorpay refund still pending is reported as refunded, not refund_failed', async () => {
    const { request, proof } = await paidQuote({ expired: true });
    refundState = 'pending';
    expect(await payCustomRequest(request.id, proof)).toEqual({ kind: 'refunded' });
    expect(await db.refundOperation.findUnique({ where: { paymentId: proof.razorpayPaymentId } })).toMatchObject({ status: 'pending', refundId: `rfnd_${proof.razorpayPaymentId}` });
  });
  it('a refund Razorpay failed is refund_failed for the customer, but the webhook acknowledges it', async () => {
    const { request, proof } = await paidQuote({ expired: true });
    refundState = 'failed';
    const res = await call(payQuote, request.token, proof);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('Contact us');
    await expect(recoverPayment(proof.razorpayPaymentId)).resolves.toBeUndefined();
  });
  it('with no refund on record, the pay route says contact us and the webhook asks to be redelivered', async () => {
    const { request, proof } = await paidQuote({ expired: true });
    const upsert = vi.spyOn(db.refundOperation, 'upsert').mockRejectedValue(new Error('db blip'));
    try {
      expect(await payCustomRequest(request.id, proof)).toEqual({ kind: 'refund_failed' });
      await expect(recoverPayment(proof.razorpayPaymentId)).rejects.toThrow('refund failed');
    } finally { upsert.mockRestore(); }
    await recoverPayment(proof.razorpayPaymentId); // Razorpay redelivers once we're back
    expect(await db.refundOperation.findUnique({ where: { paymentId: proof.razorpayPaymentId } })).toMatchObject({ status: 'processed' });
    expect(await ordersFor(proof.razorpayPaymentId)).toBe(0);
  });
});
