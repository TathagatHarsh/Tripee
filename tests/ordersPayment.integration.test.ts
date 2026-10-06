import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {}, revalidatePath: () => {} }));
const getViewer = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../lib/auth', () => ({ getViewer }));
vi.mock('../lib/guestOrders', () => ({ rememberGuestOrders: async () => {} }));
import { db } from '../lib/db';
import { formatINR } from '../lib/format';
import { paymentMatches } from '../lib/razorpay';
import { POST as placeOrder } from '../app/api/orders/route';
import { POST as openIntent } from '../app/api/payments/intent/route';

/**
 * The paid /api/orders route end to end against an isolated database: the real
 * intent and orders handlers, the real checkout validation and transaction, and
 * a stubbed Razorpay. The shop cake it orders is created here, as pickup, so
 * the suite needs no seeded catalog.
 */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
// lib/db builds its client on first use from DATABASE_URL, so pin it before any query:
// whatever the shell exports, this suite only ever touches the isolated database.
if (url) process.env.DATABASE_URL = url;
const run = randomUUID().replaceAll('-', '').slice(0, 8);
const slug = `pay-route-${run}`;
const keys: string[] = [];
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
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
  const razorpay = { orderId: '', refundStatus: 200 };
  const refunds = (paymentId: string) =>
    fetchMock.mock.calls.filter(([u]) => String(u).endsWith(`/payments/${paymentId}/refund`)).length;
  let variantId = '';

  /** A valid one-cake pickup basket; each case gets its own key and date. */
  const basket = (date: string) => {
    const idempotencyKey = randomUUID();
    keys.push(idempotencyKey);
    return {
      idempotencyKey,
      customerName: 'Route Customer',
      customerPhone: '9876543210',
      items: [{ cakeSlug: slug, variantId, qty: 1, choices: { delivery: 'pickup' } }],
      fulfillment: { method: 'pickup', slot: 'pickup', recipientName: 'Route Customer', requestedDate: date, requestedWindow: 'x' },
    };
  };
  const intent = async (body: ReturnType<typeof basket>, razorpayOrderId: string) => {
    razorpay.orderId = razorpayOrderId;
    const res = await post(openIntent, body);
    expect(res.status).toBe(200);
    return (await res.json()) as { amountPaise: number };
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
    razorpay.refundStatus = 200;
    fetchMock.mockImplementation(async (input: unknown) => {
      const target = String(input);
      if (target.endsWith('/orders')) return new Response(JSON.stringify({ id: razorpay.orderId }), { status: 200 });
      if (target.endsWith('/refund')) return new Response('{}', { status: razorpay.refundStatus });
      throw new Error(`unexpected fetch ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await db.order.deleteMany({ where: { razorpayPaymentId: { startsWith: `pay_RT${run}` } } });
    await db.checkoutAttempt.deleteMany({ where: { id: { in: keys } } });
    await db.fulfillmentBlackout.deleteMany({ where: { reason: `pay-route-${run}` } });
    await db.cakeProduct.deleteMany({ where: { slug } });
    await db.$disconnect();
  });

  it('places a paid order, and a replay with the same payment refunds nothing', async () => {
    const body = basket(day(40));
    const paid = proof('A');
    const { amountPaise } = await intent(body, paid.razorpayOrderId);

    const res = await post(placeOrder, { ...body, payment: paid });
    const json = await res.json();

    expect(res.status).toBe(201);
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
      data: { date: new Date(`${date}T00:00:00.000Z`), method: 'pickup', reason: `pay-route-${run}` },
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
});
