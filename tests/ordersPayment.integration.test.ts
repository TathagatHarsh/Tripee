import { DEFAULT_CAKE } from "../lib/schema";
import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {}, revalidatePath: () => {} }));
const getViewer = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../lib/auth', () => ({ getViewer }));
vi.mock('../lib/guestOrders', () => ({ rememberGuestOrders: async () => {} }));
// after() only works inside a Next request: capture the deferred work so a test can see it is deferred, then run it.
const deferred = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (cb: () => unknown) => { deferred.push(Promise.resolve().then(cb)); } }));
import { db } from '../lib/db';
import { formatINR } from '../lib/format';
import { recoverPayment } from '../lib/paymentRecovery';
import { paymentMatches } from '../lib/razorpay';
import { POST as placeOrder } from '../app/api/orders/route';
import { POST as openIntent } from '../app/api/payments/intent/route';

/**
 * The paid /api/orders route end to end against an isolated database: the real
 * intent and orders handlers, the real checkout validation and transaction, and
 * a stubbed Razorpay. The shop cake it orders is created here, for delivery, so
 * the suite needs no seeded catalog.
 */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
// lib/db builds its client on first use from DATABASE_URL, so pin it before any query:
// whatever the shell exports, this suite only ever touches the isolated database.
if (url) process.env.DATABASE_URL = url;
const run = randomUUID().replaceAll('-', '').slice(0, 8);
const slug = `pay-route-${run}`;
const keys: string[] = [];
// Cases were written 35–50 days out for the retired standard slot; scheduled orders reach 14 days, so 35 is tomorrow.
const day = (n: number) => new Date(Date.now() + (n - 34) * 86_400_000).toISOString().slice(0, 10);
const sign = (order: string, pay: string) => createHmac('sha256', 'secret').update(`${order}|${pay}`).digest('hex');
const proof = (name: string) => {
  const razorpayOrderId = `order_RT${run}${name}`;
  const razorpayPaymentId = `pay_RT${run}${name}`;
  return { razorpayOrderId, razorpayPaymentId, razorpaySignature: sign(razorpayOrderId, razorpayPaymentId) };
};
const post = (route: typeof placeOrder, body: unknown) =>
  route(new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body) }));

describe.skipIf(!url)('paid /api/orders on isolated PostgreSQL', () => {
  const fetchMock = vi.fn();
  const razorpay = { orderId: '', refundStatus: 200, paymentStatus: 'captured', amountDelta: 0, currency: 'INR', refunded: 0 };
  const amounts = new Map<string, number>();
  const receipts = new Map<string, string>();
  const refunds = (paymentId: string) =>
    fetchMock.mock.calls.filter(([u]) => String(u).endsWith(`/payments/${paymentId}/refund`)).length;
  let variantId = '';

  /** A valid one-cake delivery basket; each case gets its own key and date. */
  const basket = (date: string) => {
    const idempotencyKey = randomUUID();
    keys.push(idempotencyKey);
    return {
      idempotencyKey,
      customerName: 'Route Customer',
      customerPhone: '9876543210',
      items: [{ cakeSlug: slug, variantId, qty: 1, choices: { delivery: 'scheduled' } }],
      fulfillment: { method: 'delivery', slot: 'scheduled', recipientName: 'Route Customer', addressLine1: '12 Test Street', city: 'Hyderabad', state: 'Telangana', pincode: '500081', requestedDate: date, requestedWindow: '12:00–14:00', location: { lat: 17.44, lng: 78.38, placeId: '' } },
    };
  };
  const intent = async (body: ReturnType<typeof basket>, razorpayOrderId: string) => {
    razorpay.orderId = razorpayOrderId;
    const res = await post(openIntent, body);
    expect(res.status).toBe(200);
    const result = (await res.json()) as { amountPaise: number };
    amounts.set(razorpayOrderId, result.amountPaise); receipts.set(razorpayOrderId, body.idempotencyKey);
    return result;
  };

  beforeAll(async () => {
    const product = await db.cakeProduct.create({
      data: {
        slug,
        name: 'Route Test Cake',
        description: 'Test',
        category: 'chocolate',
        pricePaise: 189900,
        sizeBand: '2kg',
        productionSpec: {
          version: 1,
          allergens: ['Egg', 'Milk'],
          ingredients: ['vanilla sponge'],
          dietaryClaims: [],
          preparationNotes: 'Test cake.',
          kitchenInstructions: 'Test cake.',
          allergenStatementReviewed: true,
        },
        variants: { create: { sizeBand: '2kg', eggType: 'eggless', pricePaise: 189900 } },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    razorpay.refundStatus = 200; razorpay.paymentStatus = 'captured'; razorpay.amountDelta = 0; razorpay.currency = 'INR'; razorpay.refunded = 0;
    fetchMock.mockImplementation(async (input: unknown) => {
      const target = String(input);
      if (target.endsWith('/orders')) return new Response(JSON.stringify({ id: razorpay.orderId }), { status: 200 });
      if (target.endsWith('/refund')) return Response.json({ id: 'rfnd_' + target.split('/').at(-2), payment_id: target.split('/').at(-2), status: 'processed' }, { status: razorpay.refundStatus });
      if (/\/orders\/order_/.test(target)) {
        const attempt = await db.checkoutAttempt.findFirst({ where: { response: { path: ['razorpayOrderId'], equals: razorpay.orderId } } });
        return Response.json({ id: razorpay.orderId, receipt: receipts.get(razorpay.orderId) ?? attempt?.id, amount: amounts.get(razorpay.orderId), currency: 'INR' });
      }
      if (/\/payments\/pay_/.test(target)) {
        const stored = await db.checkoutAttempt.findFirst({ where: { response: { path: ['razorpayOrderId'], equals: razorpay.orderId } } });
        const amount = amounts.get(razorpay.orderId) ?? (stored?.response as { amountPaise?: number } | null)?.amountPaise ?? 189900;
        return Response.json({ id: target.split('/').at(-1), order_id: razorpay.orderId, status: razorpay.paymentStatus, amount: amount + razorpay.amountDelta, amount_refunded: razorpay.refunded, currency: razorpay.currency });
      }
      throw new Error(`unexpected fetch ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    // Delivery is covered city-wide, as on the live shop (lib/coverage), so no bakery fixture is needed.
    vi.stubEnv('SERVICE_AREA', 'hyderabad');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(async () => {
    await Promise.allSettled(deferred);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await db.order.deleteMany({
      where: { OR: [{ razorpayPaymentId: { startsWith: `pay_RT${run}` } }, { checkoutAttempt: { id: { in: keys } } }] },
    });
    await db.checkoutAttempt.deleteMany({ where: { id: { in: keys } } });
    await db.paymentRecovery.deleteMany({ where: { id: { in: keys } } });
    await db.refundOperation.deleteMany({ where: { paymentId: { startsWith: `pay_RT${run}` } } });
    await db.fulfillmentBlackout.deleteMany({ where: { reason: `pay-route-${run}` } });
    await db.cakeProduct.deleteMany({ where: { slug } });
    await db.$disconnect();
  });

  it('recovers a captured payment after the browser disappears, and duplicate recovery creates no second order', async () => {
    const body = basket(day(36)); const paid = proof('lostbrowser');
    await intent(body, paid.razorpayOrderId);
    expect(await db.paymentRecovery.findUnique({ where: { id: body.idempotencyKey } })).toMatchObject({ status: 'pending', payloadHash: expect.any(String) });
    await recoverPayment(paid.razorpayPaymentId);
    await recoverPayment(paid.razorpayPaymentId);
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(1);
    expect(await db.paymentRecovery.findUnique({ where: { id: body.idempotencyKey } })).toMatchObject({ status: 'completed' });
    expect(refunds(paid.razorpayPaymentId)).toBe(0);
  });
  it('recovers when the process died before saving the gateway order ID', async () => {
    const body = basket(day(36)); const paid = proof('lostintent');
    await intent(body, paid.razorpayOrderId);
    await db.checkoutAttempt.delete({ where: { id: body.idempotencyKey } });
    await recoverPayment(paid.razorpayPaymentId);
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(1);
  });
  it('recovery refunds an authoritative captured amount that differs from the intent', async () => {
    const body = basket(day(36)); const paid = proof('recoveryamount');
    await intent(body, paid.razorpayOrderId);
    amounts.set(paid.razorpayOrderId, 1);
    await recoverPayment(paid.razorpayPaymentId);
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
    expect(refunds(paid.razorpayPaymentId)).toBe(1);
  });
  it('rejects disabled builder configurations before opening a payment intent', async () => {
    const body = basket(day(35));
    const res = await post(openIntent, { ...body, items: [{ config: { ...DEFAULT_CAKE, delivery: 'scheduled', pincode: '500081' }, qty: 1 }] });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'builder_unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('lets the browser clear proof only once the gateway confirms a full refund', async () => {
    const body = basket(day(35)); const paid = proof('fullrefund');
    const { amountPaise } = await intent(body, paid.razorpayOrderId);
    razorpay.refunded = amountPaise; razorpay.paymentStatus = 'refunded';
    const res = await post(placeOrder, { ...body, payment: paid });
    expect(await res.json()).toMatchObject({ code: 'payment_refunded', refunded: true });
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
  });
  it.each(['authorized', 'created', 'failed'])('does not fulfill a signed but %s payment', async (status) => {
    const body = basket(day(35)); const paid = proof(status);
    await intent(body, paid.razorpayOrderId); razorpay.paymentStatus = status;
    const res = await post(placeOrder, { ...body, payment: paid });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'payment_pending' });
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
    expect(refunds(paid.razorpayPaymentId)).toBe(0);
  });
  it.each(['amount', 'currency', 'refunded'])('rejects a captured payment with invalid %s', async (field) => {
    const body = basket(day(35)); const paid = proof(field);
    await intent(body, paid.razorpayOrderId);
    if (field === 'amount') razorpay.amountDelta = 1;
    if (field === 'currency') razorpay.currency = 'USD';
    if (field === 'refunded') razorpay.refunded = 1;
    const res = await post(placeOrder, { ...body, payment: paid });
    expect(res.status).toBe(409);
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
  });
  it('places a paid order, and a replay with the same payment refunds nothing', async () => {
    const body = basket(day(40));
    const paid = proof('A');
    const { amountPaise } = await intent(body, paid.razorpayOrderId);

    const before = deferred.length;
    const res = await post(placeOrder, { ...body, payment: paid });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(deferred.length).toBe(before + 1); // assignment + dispatch run after the response, not inside it
    expect(json.order.payment).toEqual({ id: paid.razorpayPaymentId, paise: amountPaise });
    expect(await db.order.findUnique({ where: { ref: json.orderId } })).toMatchObject({
      paymentStatus: 'paid',
      razorpayOrderId: paid.razorpayOrderId,
      razorpayPaymentId: paid.razorpayPaymentId,
      totalPaise: amountPaise,
    });

    const again = await post(placeOrder, { ...body, payment: paid });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true, order: { payment: { id: paid.razorpayPaymentId } } });
    expect(refunds(paid.razorpayPaymentId)).toBe(0);
  });

  it('refunds a second payment sent for an order that is already placed, and still answers the replay', async () => {
    const body = basket(day(41));
    const first = proof('B');
    const second = proof('B2');
    await intent(body, first.razorpayOrderId);
    const created = await post(placeOrder, { ...body, payment: first });
    expect(created.status).toBe(201);

    razorpay.orderId = second.razorpayOrderId;
    const again = await post(placeOrder, { ...body, payment: second });

    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true, order: { payment: { id: first.razorpayPaymentId } } });
    expect(refunds(second.razorpayPaymentId)).toBe(1);
    expect(refunds(first.razorpayPaymentId)).toBe(0);
    expect(await db.order.count({ where: { razorpayPaymentId: second.razorpayPaymentId } })).toBe(0);
  });

  it('a refund through another key stops the real confirm', async () => {
    const body = basket(day(42));
    const paid = proof('C');
    await intent(body, paid.razorpayOrderId);

    // Another checkout key with a basket that cannot be read: it fails, so the payment is refunded.
    const other = await post(placeOrder, { idempotencyKey: randomUUID(), payment: paid });
    expect(other.status).toBe(400);
    expect(await other.json()).toMatchObject({ code: 'invalid_request', refunded: true });

    // The real confirm, on the key that held the binding, can no longer buy an order.
    const confirm = await post(placeOrder, { ...body, payment: paid });
    expect(confirm.status).toBe(409);
    expect(await confirm.json()).toMatchObject({ code: 'payment_mismatch', refunded: true });
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
    const row = await db.checkoutAttempt.findUnique({ where: { id: body.idempotencyKey } });
    expect(row).toMatchObject({ status: 'failed', lastError: `refunded:${paid.razorpayPaymentId}`, response: null });
    expect(paymentMatches(row?.response, paid, 189900)).toBe(false);
    expect(refunds(paid.razorpayPaymentId)).toBe(1);
  });

  it('refunds when the total changed while paying, naming the amount that was paid', async () => {
    const body = basket(day(43));
    const paid = proof('D');
    await intent(body, paid.razorpayOrderId);
    amounts.set(paid.razorpayOrderId, 12345);
    await db.checkoutAttempt.update({
      where: { id: body.idempotencyKey },
      data: { response: { razorpayOrderId: paid.razorpayOrderId, amountPaise: 12345 } },
    });

    const res = await post(placeOrder, { ...body, payment: paid });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: 'payment_mismatch', refunded: true });
    expect(json.error).toContain('₹123.45 has been refunded');
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
  });

  it('refunds when the bakery turns out to be closed, and a failed refund says to get in touch', async () => {
    const date = day(44);
    await db.fulfillmentBlackout.create({
      data: { date: new Date(`${date}T00:00:00.000Z`), method: 'delivery', reason: `pay-route-${run}` },
    });
    const body = basket(date);
    const paid = proof('E');
    await intent(body, paid.razorpayOrderId);
    razorpay.refundStatus = 400;

    const res = await post(placeOrder, { ...body, payment: paid });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: 'capacity_unavailable', refunded: false });
    expect(json.error).toContain(`Contact us with payment ${paid.razorpayPaymentId}.`);
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
    // The binding is gone even though the refund failed: this payment cannot buy an order now.
    const confirm = await post(placeOrder, { ...body, payment: paid });
    expect(confirm.status).toBe(409);
    expect(await confirm.json()).toMatchObject({ code: 'payment_mismatch' });
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
  });

  it('a paid order that fails on our side is refunded, and never told nothing was charged', async () => {
    const body = basket(day(45));
    const paid = proof('F');
    const { amountPaise } = await intent(body, paid.razorpayOrderId);
    getViewer.mockRejectedValueOnce(new Error('session store down'));

    const res = await post(placeOrder, { ...body, payment: paid });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toMatchObject({ code: 'server_error', refunded: true });
    expect(json.error).toBe(
      `We couldn't place the order, so your payment of ${formatINR(amountPaise)} has been refunded. Something went wrong on our side; please try again.`,
    );
    expect(refunds(paid.razorpayPaymentId)).toBe(1);
  });

  it('a payment that already bought an order can never buy a second one', async () => {
    const body = basket(day(46));
    const paid = proof('G');
    await intent(body, paid.razorpayOrderId);
    const first = await (await post(placeOrder, { ...body, payment: paid })).json();

    // The same payment id presented again through another checkout's Razorpay order.
    const other = basket(day(47));
    const { razorpayOrderId } = proof('G2');
    await intent(other, razorpayOrderId);
    const again = { razorpayOrderId, razorpayPaymentId: paid.razorpayPaymentId, razorpaySignature: sign(razorpayOrderId, paid.razorpayPaymentId) };
    const res = await post(placeOrder, { ...other, payment: again });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true, order: { ref: first.orderId } });
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(1);
    expect(refunds(paid.razorpayPaymentId)).toBe(0);
  });

  // The checkout page sends a saved payment on its own key when the form changed after paying.
  it('a saved payment sent with changed details, before its order exists, is refunded', async () => {
    const body = basket(day(48));
    const paid = proof('H');
    await intent(body, paid.razorpayOrderId);

    const res = await post(placeOrder, { ...body, customerName: 'Edited Customer', payment: paid });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'idempotency_conflict', refunded: true });
    expect(refunds(paid.razorpayPaymentId)).toBe(1);
    expect(await db.order.count({ where: { razorpayPaymentId: paid.razorpayPaymentId } })).toBe(0);
  });

  it('a saved payment sent with changed details, after its order exists, is answered with that order', async () => {
    const body = basket(day(38));
    const paid = proof('I');
    await intent(body, paid.razorpayOrderId);
    const placed = await (await post(placeOrder, { ...body, payment: paid })).json();

    const res = await post(placeOrder, { ...body, customerName: 'Edited Customer', payment: paid });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true, order: { ref: placed.orderId } });
    expect(refunds(paid.razorpayPaymentId)).toBe(0);
  });

  it('explicit offline mode places an unpaid order without Razorpay', async () => {
    vi.stubEnv('PAYMENT_MODE', 'offline');
    vi.stubEnv('RAZORPAY_KEY_ID', '');
    vi.stubEnv('RAZORPAY_KEY_SECRET', '');

    const res = await post(placeOrder, basket(day(39)));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.order.payment).toBeNull();
    expect(await db.order.findUnique({ where: { ref: json.orderId } })).toMatchObject({
      paymentStatus: 'none',
      razorpayOrderId: null,
      razorpayPaymentId: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('queues one confirmation email for a paid delivery order with an email, and none on replay', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    const base = basket(day(41));
    const body = { ...base, fulfillment: { ...base.fulfillment, contactEmail: 'asha@example.com' } };
    const paid = proof('email');
    await intent(body, paid.razorpayOrderId);
    const res = await post(placeOrder, { ...body, payment: paid });
    expect(res.status).toBe(201);
    const order = await db.order.findUniqueOrThrow({ where: { ref: (await res.json()).orderId } });
    const emails = () => db.notificationOutbox.findMany({ where: { orderId: order.id, channel: 'email' } });
    expect(await emails()).toMatchObject([{ destination: 'asha@example.com', dedupeKey: `email:order:${order.id}:confirmed` }]);
    await post(placeOrder, { ...body, payment: paid });
    expect(await emails()).toHaveLength(1);
  });
  it('queues no email when the customer gave none', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    const body = basket(day(42)); const paid = proof('noemail');
    await intent(body, paid.razorpayOrderId);
    const res = await post(placeOrder, { ...body, payment: paid });
    const order = await db.order.findUniqueOrThrow({ where: { ref: (await res.json()).orderId } });
    expect(await db.notificationOutbox.count({ where: { orderId: order.id, channel: 'email' } })).toBe(0);
  });
});
