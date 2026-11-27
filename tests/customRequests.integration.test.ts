import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { adminQuote, cancelCustomRequest, createAdminQuote, createCustomRequest, payCustomRequest, runCustomRequestWorker } from '../lib/customRequests';
import { recoverPayment } from '../lib/paymentRecovery';
import { durableRefund } from '../lib/refunds';
import { POST as openQuoteIntent } from '../app/api/custom-requests/[token]/intent/route';
import { POST as payQuote } from '../app/api/custom-requests/[token]/pay/route';
import { handleInbound } from '../lib/whatsappInbound';
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = 0;
describe.skipIf(!url)('custom requests priced by the admin on isolated PostgreSQL', () => {
  const ADMIN = '919000000001', ADMIN2 = '919000000002', CUSTOMER = '919822200000', STRANGER = '919811100000';
  const refs: string[] = [];
  const sent = vi.fn();
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'tok'); vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'PNID');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'secret'); vi.stubEnv('WHATSAPP_ADMIN_NUMBERS', '9000000001,9000000002');
    sent.mockReset(); sent.mockResolvedValue({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', sent);
  });
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
    await db.customRequest.deleteMany({ where: { ref: { in: refs } } });
    // Replies to the admin aren't tied to a request, so they outlive it: clear them, or a rerun's same ids look already answered.
    await db.notificationOutbox.deleteMany({ where: { dedupeKey: { startsWith: 'wa-reply:wamid.' }, destination: { in: [ADMIN, ADMIN2, STRANGER, CUSTOMER] } } });
    refs.length = 0; afterCallbacks.length = 0;
  });
  const input = (over: object = {}) => ({ name: 'Asha', phone: '98222 00000', sizeKg: 1.5, flavour: 'Chocolate', consent: true as const,
    dueAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    address: { lat: 13.6, lng: 77.6, address: '12 Secret Street', locality: 'Kondapur', city: 'Hyderabad', state: 's', pincode: '500001', placeId: 'p' }, ...over });
  /** A website request: saved, and its photo message queued to the admins. `wamid` stands in for Meta's id once sent. */
  async function asked(over: object = {}) {
    const { ref } = await createCustomRequest(input(over), Buffer.from('img')); refs.push(ref);
    const r = await db.customRequest.findUniqueOrThrow({ where: { ref } });
    await db.notificationOutbox.updateMany({ where: { customRequestId: r.id, destination: ADMIN }, data: { status: 'sent', providerMessageId: `wamid.ask.${ref}` } });
    return r;
  }
  const rows = (id: string) => db.notificationOutbox.findMany({ where: { customRequestId: id }, orderBy: { createdAt: 'asc' } });
  const reload = (id: string) => db.customRequest.findUniqueOrThrow({ where: { id } });
  const textOf = (r: { payload: unknown }) => JSON.stringify(r.payload);
  const reply = async (id: string) => textOf((await db.notificationOutbox.findFirstOrThrow({ where: { dedupeKey: `wa-reply:${id}:${ADMIN}` } })));

  it('a website request goes to every admin number as the admin_custom_request photo message, never to a bakery', async () => {
    const r = await asked();
    expect(r).toMatchObject({ status: 'awaiting_quote', vendorId: null });
    const all = await rows(r.id);
    expect(all.map(x => x.destination).sort()).toEqual([ADMIN, ADMIN2]);
    expect(all[0].payload).toMatchObject({ type: 'template', name: 'admin_custom_request' });
    // Admins only, so the customer's number and street are in it, and the Maps button carries the pin.
    expect(textOf(all[0])).toContain('Asha · +91 98222 00000'); expect(textOf(all[0])).toContain('12 Secret Street, Hyderabad 500001');
    expect(textOf(all[0])).toContain('"text":"13.6,77.6"');
    // The stored photo is WebP; WhatsApp gets it through the signed JPEG converter, never the blob URL.
    expect(textOf(all[0])).toContain(`/api/whatsapp/photo/${r.id}?s=`);
    expect(afterCallbacks).toHaveLength(1); // the send is kicked off at once, after the response
  });
  it('the admin replies "1000" to a request\'s message: that request is quoted at ₹1,000, even with others waiting', async () => {
    const first = await asked(), second = await asked();
    await handleInbound({ id: 'wamid.r1', from: ADMIN, text: '1000', contextId: `wamid.ask.${second.ref}` });
    expect(await reload(second.id)).toMatchObject({ status: 'quoted', quotePaise: 100000, vendorId: null, vendorQuotePaise: null });
    expect((await reload(first.id)).status).toBe('awaiting_quote');
    const all = await rows(second.id);
    expect(all.find(x => x.destination === CUSTOMER)!.payload).toMatchObject({ type: 'template', name: 'custom_quote' });
    expect(textOf(all.find(x => x.destination === CUSTOMER)!)).toContain('1,000');
    expect(await reply('wamid.r1')).toContain(`${second.ref}: quote of ₹1,000 sent`);
    // The other admin is told; the one who replied isn't sent the update twice.
    expect(all.filter(x => x.dedupeKey.startsWith(`cr:${second.id}:quote:admin`)).map(x => x.destination)).toEqual([ADMIN2]);
    expect(sent).not.toHaveBeenCalled();
  });
  it('a typed ref picks the request; with one waiting a bare price is enough', async () => {
    // "Only one waiting" is global: close strays other suites left open in the shared scratch DB.
    await db.customRequest.updateMany({ where: { status: { in: ['awaiting_quote', 'no_bakery'] } }, data: { status: 'cancelled' } });
    const a = await asked(), b = await asked();
    await handleInbound({ id: 'wamid.r2', from: ADMIN, text: `Rs. 1,500 ${a.ref.toLowerCase()}` });
    expect(await reload(a.id)).toMatchObject({ status: 'quoted', quotePaise: 150000 });
    await handleInbound({ id: 'wamid.r3', from: ADMIN, text: '1200' });
    expect(await reload(b.id)).toMatchObject({ status: 'quoted', quotePaise: 120000 });
  });
  it('a bare price with several waiting asks which, naming them; nothing is quoted', async () => {
    const a = await asked(), b = await asked();
    await handleInbound({ id: 'wamid.r4', from: ADMIN, text: '1000' });
    const text = await reply('wamid.r4');
    expect(text).toContain('Which request? Reply to its message'); expect(text).toContain(a.ref); expect(text).toContain(b.ref);
    expect((await reload(a.id)).status).toBe('awaiting_quote'); expect((await reload(b.id)).status).toBe('awaiting_quote');
  });
  it('a price below delivery plus ₹100 is refused with the range, and the request still waits', async () => {
    const r = await asked();
    await handleInbound({ id: 'wamid.r5', from: ADMIN, text: '200', contextId: `wamid.ask.${r.ref}` });
    expect(await reply('wamid.r5')).toContain("between ₹250");
    expect((await reload(r.id)).status).toBe('awaiting_quote');
  });
  it('an out-of-range number gets the rupees hint', async () => {
    await asked();
    await handleInbound({ id: 'wamid.r6', from: ADMIN, text: '5', contextId: 'wamid.unknown' });
    expect(await reply('wamid.r6')).toContain('e.g. 1800');
  });
  it('the same message delivered twice quotes once and replies once', async () => {
    const r = await asked();
    const msg = { id: 'wamid.r7', from: ADMIN, text: '1000', contextId: `wamid.ask.${r.ref}` };
    await handleInbound(msg); await handleInbound(msg);
    expect((await rows(r.id)).filter(x => x.destination === CUSTOMER)).toHaveLength(1);
    expect(await db.notificationOutbox.count({ where: { dedupeKey: { startsWith: 'wa-reply:wamid.r7' } } })).toBe(1);
  });
  it("the admin's Can't do it cancels the request and tells the customer", async () => {
    const r = await asked();
    await handleInbound({ id: 'wamid.r8', from: ADMIN, text: "Can't do it", payload: `cq_no:${r.id}` });
    expect((await reload(r.id)).status).toBe('cancelled');
    expect(textOf((await rows(r.id)).find(x => x.destination === CUSTOMER)!)).toContain('has been cancelled');
    expect(await reply('wamid.r8')).toContain(`Order no. ${r.ref} has been cancelled and the customer has been informed.`);
  });
  it('a price from a number that is not an admin quotes nothing', async () => {
    const r = await asked();
    await handleInbound({ id: 'wamid.r9', from: STRANGER, text: '1000', contextId: `wamid.ask.${r.ref}` });
    expect((await reload(r.id)).status).toBe('awaiting_quote');
  });
  it('the customer taps Not for me: declined and the admins told', async () => {
    const r = await asked();
    expect((await adminQuote(r.id, 100000)).ok).toBe(true);
    await handleInbound({ id: 'wamid.nfm', from: CUSTOMER, text: 'Not for me', payload: `cq_decline:${r.id}` });
    expect((await reload(r.id)).status).toBe('declined');
    const all = await rows(r.id);
    expect(textOf(all.filter(x => x.destination === CUSTOMER).at(-1)!)).toContain('No problem');
    expect(all.some(x => x.destination === ADMIN && textOf(x).includes('passed on'))).toBe(true);
  });
  it('any other customer text goes to the admins', async () => {
    const r = await asked();
    await handleInbound({ id: 'wamid.haggle', from: CUSTOMER, text: 'can you do 1500?' });
    expect(textOf((await rows(r.id)).at(-1)!)).toContain(`Customer on ${r.ref} says: can you do 1500?`);
    expect((await reload(r.id)).status).toBe('awaiting_quote');
  });
  describe('deadlines', () => {
    const minutes = (n: number) => new Date(Date.now() + n * 60000);
    const sentTo = async (id: string, key: string) => (await rows(id)).filter(x => x.dedupeKey === `cr:${id}:${key}:${x.destination}`).map(x => x.destination).sort();
    it('a website request gets an admin reply deadline: an hour, or from opening time at night', async () => {
      const r = await asked();
      const by = r.offerExpiresAt!.getTime() - r.createdAt.getTime();
      expect(by).toBeGreaterThanOrEqual(59 * 60000); // exactly an hour by day, longer at night
      expect(by).toBeLessThanOrEqual(15 * 3600000);
    });
    it('30 minutes before the deadline the admins get one reminder, however often the worker runs', async () => {
      const r = await asked();
      await db.customRequest.update({ where: { id: r.id }, data: { offerExpiresAt: minutes(20) } });
      await runCustomRequestWorker(); await runCustomRequestWorker();
      expect(await sentTo(r.id, 'remind')).toEqual([ADMIN, ADMIN2]);
      expect(textOf((await rows(r.id)).find(x => x.dedupeKey.startsWith(`cr:${r.id}:remind:`))!)).toContain('no price sent yet');
      expect((await reload(r.id)).status).toBe('awaiting_quote');
    });
    it('past the deadline the request closes: the customer and the admins are told, and a late price is refused', async () => {
      const r = await asked();
      await db.customRequest.update({ where: { id: r.id }, data: { offerExpiresAt: minutes(-1) } });
      expect((await runCustomRequestWorker()).closed).toBeGreaterThanOrEqual(1);
      expect((await reload(r.id)).status).toBe('cancelled');
      expect(textOf((await rows(r.id)).find(x => x.dedupeKey.startsWith(`cr:${r.id}:timeout:customer`))!)).toContain("couldn't take your custom cake request");
      expect(await sentTo(r.id, 'timeout')).toEqual([ADMIN, ADMIN2]);
      expect(await adminQuote(r.id, 100000)).toMatchObject({ ok: false });
    });
    it('a request without a deadline (from before deadlines) is never closed', async () => {
      const r = await asked();
      await db.customRequest.update({ where: { id: r.id }, data: { offerExpiresAt: null } });
      await runCustomRequestWorker();
      expect((await reload(r.id)).status).toBe('awaiting_quote');
    });
    it('a quote lasts six hours at most; 30 minutes before, the customer is reminded with the pay link', async () => {
      const r = await asked();
      await adminQuote(r.id, 100000);
      const q = await reload(r.id);
      expect(q.quoteExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(6 * 3600000);
      expect(q.quoteExpiresAt!.getTime() - Date.now()).toBeGreaterThan(5.9 * 3600000);
      await db.customRequest.update({ where: { id: r.id }, data: { quoteExpiresAt: minutes(25) } });
      await runCustomRequestWorker();
      const reminder = (await rows(r.id)).find(x => x.dedupeKey.startsWith(`cr:${r.id}:remind:customer`))!;
      expect(reminder.destination).toBe(CUSTOMER);
      expect(textOf(reminder)).toContain(`/c/${r.token}`); expect(textOf(reminder)).toContain('1,000');
    });
    it('an unpaid quote expires: the customer and the admins are told', async () => {
      const r = await asked();
      await adminQuote(r.id, 100000);
      await db.customRequest.update({ where: { id: r.id }, data: { quoteExpiresAt: minutes(-1) } });
      expect((await runCustomRequestWorker()).expired).toBeGreaterThanOrEqual(1);
      expect((await reload(r.id)).status).toBe('expired');
      expect(textOf((await rows(r.id)).find(x => x.dedupeKey.startsWith(`cr:${r.id}:expired:customer`))!)).toContain('quote has expired');
      expect(await sentTo(r.id, 'expired')).toEqual([ADMIN, ADMIN2]);
    });
  });
  it('cancel tells the customer; a paid request is left alone', async () => {
    const r = await asked();
    expect(await cancelCustomRequest(r.id)).toBe(true);
    expect(textOf((await rows(r.id)).find(x => x.destination === CUSTOMER)!)).toContain('has been cancelled');
    const p = await asked();
    await db.customRequest.update({ where: { id: p.id }, data: { status: 'paid' } });
    expect(await cancelCustomRequest(p.id)).toBe(false);
  });
  it('the admin page quote tells every admin, and refuses a request that is no longer open or due too soon', async () => {
    const r = await asked();
    expect(await adminQuote(r.id, 200000)).toEqual({ ok: true, quotePaise: 200000 });
    expect((await rows(r.id)).filter(x => x.dedupeKey.startsWith(`cr:${r.id}:quote:admin`)).map(x => x.destination).sort()).toEqual([ADMIN, ADMIN2]);
    expect(await adminQuote(r.id, 200000)).toMatchObject({ ok: false });
    const soon = await asked({ dueAt: new Date(Date.now() + 30 * 60000).toISOString() });
    expect(await adminQuote(soon.id, 200000)).toMatchObject({ ok: false });
    expect((await reload(soon.id)).status).toBe('awaiting_quote');
  });
  it('a phone request is saved and quoted in one step; a refused one leaves nothing behind', async () => {
    const res = await createAdminQuote(input(), null, 200000);
    expect(res).toMatchObject({ ok: true, quotePaise: 200000 }); refs.push(res.ref!);
    const r = await db.customRequest.findUniqueOrThrow({ where: { ref: res.ref! } });
    expect(r).toMatchObject({ status: 'quoted', phone: CUSTOMER, vendorId: null });
    expect(r.photoUrl).toContain('/brand/');
    const all = await rows(r.id);
    expect(all.find(x => x.destination === CUSTOMER)!.payload).toMatchObject({ name: 'custom_quote' });
    expect(all.some(x => textOf(x).includes('admin_custom_request'))).toBe(false);
    const before = await db.customRequest.count();
    expect(await createAdminQuote(input(), null, 20000)).toMatchObject({ ok: false });
    expect(await db.customRequest.count()).toBe(before);
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

  it('turns a paid quote into a confirmed order MakeYourCakes makes itself: no bakery', async () => {
    const { request, proof } = await paidQuote();
    const result = await payCustomRequest(request.id, proof);
    expect(result).toMatchObject({ kind: 'paid', orderRef: expect.stringMatching(/^MC-/) });
    const ref = (result as { orderRef: string }).orderRef;
    const order = await db.order.findUniqueOrThrow({ where: { ref }, include: { assignments: true, items: true, events: true } });
    expect(order).toMatchObject({
      totalPaise: 222000, payablePaise: 222000, productSubtotalPaise: 207000, deliveryFeePaise: 15000, status: 'confirmed', paymentStatus: 'paid',
      razorpayOrderId: proof.razorpayOrderId, razorpayPaymentId: proof.razorpayPaymentId, assignmentState: 'MANUAL', currentAssignmentId: null,
      cakeName: 'Custom cake · 1.5 kg · Chocolate', cakeImageUrl: 'https://x.test/p.jpg', customerName: 'Asha', customerPhone: CUSTOMER,
      addressLine1: '12 Secret Street', city: 'Hyderabad', state: 'Telangana', pincode: '500084', customerNotes: 'Happy 30th',
      deliverySlot: 'custom', leadHours: 50, dueAt: request.dueAt, requestedFor: request.dueAt, requestedWindow: null,
    });
    expect(order.config).toEqual({ custom: true, sizeKg: 1.5, flavour: 'Chocolate', cakeMessage: 'Happy 30th', budgetPaise: 200000 });
    expect(order.priceBreakdown).toEqual({ custom: { quotePaise: 222000, deliveryFeePaise: 15000 } });
    expect(order.deliveryLocation).toEqual({ latitude: 14.2, longitude: 77.6 });
    expect(order.items).toMatchObject([{ label: 'Custom cake · 1.5 kg · Chocolate', amountPaise: 207000 }]);
    expect(order.events).toMatchObject([{ fromStatus: 'draft', toStatus: 'confirmed' }]);
    expect(order.assignments).toHaveLength(0);
    expect(await reload(request.id)).toMatchObject({ status: 'paid', orderId: order.id });
    expect(await db.checkoutAttempt.findUnique({ where: { id: `custom:${request.id}` } })).toMatchObject({ status: 'completed', orderId: order.id });
    const rows = await db.notificationOutbox.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.some((r) => r.destination === CUSTOMER)).toBe(true);
    expect(rows.some((r) => r.destination === ADMIN)).toBe(true);
    expect(rows.every((r) => [CUSTOMER, ADMIN].includes(r.destination!))).toBe(true);
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
