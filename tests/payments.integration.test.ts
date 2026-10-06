import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '../lib/db';
import { openPaymentIntent, refundPayment, refundUnlessOk } from '../lib/checkoutPayment';
import { applyStatusTransition } from '../lib/orderTransition';
import { paymentMatches } from '../lib/razorpay';

/**
 * The payment-intent binding on a checkout attempt, against an isolated
 * database like the other *.integration suites. Razorpay itself is a stubbed fetch.
 */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
// lib/db builds its client on first use from DATABASE_URL, so pin it before any query:
// whatever the shell exports, this suite only ever touches the isolated database.
if (url) process.env.DATABASE_URL = url;
const keys: string[] = [];
const freshKey = () => {
  const key = randomUUID();
  keys.push(key);
  return key;
};

const orderReply = (id: string) => new Response(JSON.stringify({ id }), { status: 200 });
const later = () => new Date(Date.now() + 86_400_000);
const attempt = (key: string) => db.checkoutAttempt.findUnique({ where: { id: key } });

describe.skipIf(!url)('payment intent on isolated PostgreSQL', () => {
  // One mock for the whole suite, so "fetch called once in total" is a real count.
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks(); // the console spy only; fetchMock keeps its call count
  });

  afterAll(async () => {
    await db.checkoutAttempt.deleteMany({ where: { id: { in: keys } } });
  });

  // The cases below build on each other: one key, one basket, in this order.
  const key = freshKey();

  it('creates one Razorpay order and stores the binding', async () => {
    fetchMock.mockResolvedValueOnce(orderReply('order_A'));

    const result = await openPaymentIntent(key, 'h1', 124900);

    expect(result).toEqual({ kind: 'ok', record: { razorpayOrderId: 'order_A', amountPaise: 124900 } });
    const row = await attempt(key);
    expect(row).toMatchObject({ status: 'processing', payloadHash: 'h1' });
    expect(row?.response).toEqual({ razorpayOrderId: 'order_A', amountPaise: 124900 });
  });

  it('reuses the Razorpay order for the same key and amount', async () => {
    const result = await openPaymentIntent(key, 'h1', 124900);

    expect(result).toEqual({ kind: 'ok', record: { razorpayOrderId: 'order_A', amountPaise: 124900 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a new Razorpay order when the amount changes', async () => {
    fetchMock.mockResolvedValueOnce(orderReply('order_B'));

    const result = await openPaymentIntent(key, 'h1', 125000);

    expect(result).toEqual({ kind: 'ok', record: { razorpayOrderId: 'order_B', amountPaise: 125000 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await attempt(key))?.response).toEqual({ razorpayOrderId: 'order_B', amountPaise: 125000 });
  });

  it('refuses a different basket on the same key', async () => {
    expect(await openPaymentIntent(key, 'h2', 124900)).toEqual({ kind: 'conflict' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // unchanged: no Razorpay call
  });

  it('returns unavailable when Razorpay fails', async () => {
    const other = freshKey();
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    expect(await openPaymentIntent(other, 'h1', 124900)).toEqual({ kind: 'unavailable' });
    expect(await attempt(other)).toBeNull();
  });

  it('returns completed for a completed attempt without calling Razorpay', async () => {
    const done = freshKey();
    await db.checkoutAttempt.create({
      data: { id: done, payloadHash: 'h1', status: 'completed', expiresAt: later(), response: { orderId: 'MC-DONE' } },
    });
    const before = fetchMock.mock.calls.length;

    expect(await openPaymentIntent(done, 'h1', 124900)).toEqual({ kind: 'completed' });
    expect(fetchMock).toHaveBeenCalledTimes(before);
    expect(await attempt(done)).toMatchObject({ status: 'completed', response: { orderId: 'MC-DONE' } });
  });

  it('does not overwrite an attempt that completed meanwhile', async () => {
    const racing = freshKey();
    await db.checkoutAttempt.create({
      data: { id: racing, payloadHash: 'h1', status: 'processing', expiresAt: later() },
    });
    // The order lands while Razorpay is still answering.
    fetchMock.mockImplementationOnce(async () => {
      await db.checkoutAttempt.update({
        where: { id: racing },
        data: { status: 'completed', response: { orderId: 'MC-RACE' } },
      });
      return orderReply('order_X');
    });

    expect(await openPaymentIntent(racing, 'h1', 124900)).toEqual({ kind: 'completed' });
    expect(await attempt(racing)).toMatchObject({ status: 'completed', response: { orderId: 'MC-RACE' } });
  });

  it('keeps the first row when another intent creates it while Razorpay answers', async () => {
    const racing = freshKey();
    fetchMock.mockImplementationOnce(async () => {
      await db.checkoutAttempt.create({
        data: { id: racing, payloadHash: 'h1', status: 'processing', expiresAt: later() },
      });
      return orderReply('order_R');
    });

    expect(await openPaymentIntent(racing, 'h1', 124900)).toEqual({
      kind: 'ok',
      record: { razorpayOrderId: 'order_R', amountPaise: 124900 },
    });
    expect((await attempt(racing))?.response).toEqual({ razorpayOrderId: 'order_R', amountPaise: 124900 });
  });

  it('refuses when a different basket creates the row while Razorpay answers', async () => {
    const racing = freshKey();
    fetchMock.mockImplementationOnce(async () => {
      await db.checkoutAttempt.create({
        data: { id: racing, payloadHash: 'other', status: 'processing', expiresAt: later() },
      });
      return orderReply('order_S');
    });

    expect(await openPaymentIntent(racing, 'h1', 124900)).toEqual({ kind: 'conflict' });
    expect(await attempt(racing)).toMatchObject({ payloadHash: 'other', response: null });
  });
});

describe.skipIf(!url)('refundUnlessOk', () => {
  const fetchMock = vi.fn();
  const refundCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/payments/pay_B/refund'));
  const failure = (code: string, error: string) => Response.json({ error, code }, { status: 409 });
  const capacity = () => failure('capacity_unavailable', 'That slot has reached its cake capacity.');
  const refunded = () => new Response('{}', { status: 200 });
  const proofFor = (razorpayOrderId: string) => ({ razorpayOrderId, razorpayPaymentId: 'pay_B', razorpaySignature: '0'.repeat(64) });

  /** An attempt holding the Razorpay order the customer paid, as the intent route leaves it. */
  const seeded = async () => {
    const key = freshKey();
    const orderId = `order_${randomUUID().replaceAll('-', '').slice(0, 14)}`; // one per attempt, like Razorpay's
    fetchMock.mockResolvedValueOnce(orderReply(orderId));
    await openPaymentIntent(key, 'h1', 124900);
    fetchMock.mockClear();
    return { key, proof: proofFor(orderId) };
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await db.order.deleteMany({ where: { ref: { startsWith: 'PAY-' } } });
    // Every case reuses pay_B, which Razorpay never does; a leftover marker would answer for the next case.
    await db.checkoutAttempt.deleteMany({ where: { id: { in: keys } } });
  });

  afterAll(async () => {
    await db.checkoutAttempt.deleteMany({ where: { id: { in: keys } } });
  });

  it('passes a success through untouched', async () => {
    const res = new Response('{}', { status: 201 });

    const out = await refundUnlessOk(res, proofFor('order_none'));

    expect(out).toBe(res);
    expect(out.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refunds a failure and clears the attempt', async () => {
    const { key, proof } = await seeded();
    fetchMock.mockResolvedValueOnce(refunded());

    const out = await refundUnlessOk(capacity(), proof);

    expect(out.status).toBe(409);
    expect(await out.json()).toEqual({
      error:
        "We couldn't place the order, so your payment of ₹1,249.00 has been refunded. That slot has reached its cake capacity.",
      code: 'capacity_unavailable',
      refunded: true,
    });
    expect(refundCalls()).toHaveLength(1);
    expect(await attempt(key)).toMatchObject({ status: 'failed', lastError: 'refunded:pay_B', response: null });
  });

  it('amount mismatch refunds and clears the attempt', async () => {
    const { key, proof } = await seeded();
    fetchMock.mockResolvedValueOnce(refunded());

    const out = await refundUnlessOk(
      failure('payment_mismatch', 'The order total changed while you were paying.'),
      proof,
    );

    expect(out.status).toBe(409);
    expect(await out.json()).toMatchObject({ code: 'payment_mismatch', refunded: true });
    expect(refundCalls()).toHaveLength(1);
    expect(await attempt(key)).toMatchObject({ status: 'failed', lastError: 'refunded:pay_B', response: null });
  });

  it('never refunds a payment an order already holds, and answers with that order', async () => {
    const { key, proof } = await seeded();
    const { ref } = await db.order.create({
      data: {
        ref: `PAY-${randomUUID().slice(0, 8)}`,
        priceBreakdown: {},
        totalPaise: 124900,
        payablePaise: 124900,
        deliverySlot: 'standard',
        leadHours: 24,
        razorpayPaymentId: 'pay_B',
      },
    });
    const out = await refundUnlessOk(capacity(), proof);

    expect(out.status).toBe(200);
    expect(await out.json()).toMatchObject({ duplicate: true, order: { ref } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await attempt(key)).toMatchObject({ status: 'processing', response: { razorpayOrderId: proof.razorpayOrderId } });
  });

  it('reports a failed refund honestly, and does not leave the payment spendable', async () => {
    const { key, proof } = await seeded();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));

    const out = await refundUnlessOk(capacity(), proof);

    const body = await out.json();
    expect(out.status).toBe(409);
    expect(body.refunded).toBe(false);
    expect(body.error).toMatch(
      /^We couldn't place the order and couldn't refund your payment automatically\. Contact us with payment pay_B\./,
    );
    // Fail closed: the binding is gone, so this proof can no longer buy an order,
    // and it is not marked refunded because the money has not moved.
    const row = await attempt(key);
    expect(row).toMatchObject({ status: 'failed', lastError: 'refunding:pay_B', response: null });
    expect(paymentMatches(row?.response, proof, 124900)).toBe(false);
  });

  it('asks Razorpay again on a retry after a failed refund', async () => {
    const { key, proof } = await seeded();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    await refundUnlessOk(capacity(), proof);
    fetchMock.mockResolvedValueOnce(refunded());

    const retry = await refundUnlessOk(capacity(), proof);

    expect(await retry.json()).toMatchObject({ refunded: true });
    expect(refundCalls()).toHaveLength(2);
    expect(await attempt(key)).toMatchObject({ status: 'failed', lastError: 'refunded:pay_B', response: null });
  });

  it('does not refund the same payment twice', async () => {
    const { proof } = await seeded();
    fetchMock.mockResolvedValue(refunded());

    const first = await refundUnlessOk(capacity(), proof);
    const second = await refundUnlessOk(capacity(), proof);

    expect(refundCalls()).toHaveLength(1);
    expect(await first.json()).toMatchObject({ refunded: true });
    expect(await second.json()).toEqual({
      error: "We couldn't place the order, so your payment has been refunded. That slot has reached its cake capacity.",
      code: 'capacity_unavailable',
      refunded: true,
    });
  });

  it('a refund through another key stops the real confirm', async () => {
    // The failing request is some other checkout (key K2); the payment is bound on K.
    const { key, proof } = await seeded();
    fetchMock.mockResolvedValueOnce(refunded());

    const out = await refundUnlessOk(failure('invalid_request', "That order couldn't be read."), proof);

    expect(await out.json()).toMatchObject({ refunded: true });
    const row = await attempt(key);
    expect(row).toMatchObject({ status: 'failed', response: null });
    expect(paymentMatches(row?.response, proof, 124900)).toBe(false);
    expect(await db.order.count({ where: { razorpayPaymentId: 'pay_B' } })).toBe(0);
  });

  it('refunds but touches nothing when no attempt binds the order', async () => {
    const other = freshKey();
    await db.checkoutAttempt.create({
      data: { id: other, payloadHash: 'h1', status: 'processing', expiresAt: later(), response: { razorpayOrderId: 'order_other', amountPaise: 500 } },
    });
    fetchMock.mockResolvedValueOnce(refunded());

    const out = await refundUnlessOk(capacity(), proofFor('order_unbound'));

    expect(await out.json()).toMatchObject({ refunded: true });
    expect(await attempt(other)).toMatchObject({ status: 'processing', response: { razorpayOrderId: 'order_other' } });
  });

  it('refunds nothing and says so when the lookup fails', async () => {
    const { key, proof } = await seeded();
    const real = (globalThis as unknown as { prisma: object }).prisma;
    (globalThis as unknown as { prisma: object }).prisma = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === 'checkoutAttempt') throw new Error('database unreachable');
        return Reflect.get(target, prop, receiver);
      },
    });
    let out: Response;
    try {
      out = await refundUnlessOk(capacity(), proof);
    } finally {
      (globalThis as unknown as { prisma: object }).prisma = real;
    }

    const body = await out.json();
    expect(body.refunded).toBe(false);
    expect(body.error).toMatch(/^We couldn't place the order and couldn't refund your payment automatically\. Contact us with payment pay_B\./);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await attempt(key)).toMatchObject({ status: 'processing', response: { razorpayOrderId: proof.razorpayOrderId } });
  });

  it('leaves an attempt that completed meanwhile alone', async () => {
    const key = freshKey();
    await db.checkoutAttempt.create({
      data: { id: key, payloadHash: 'h1', status: 'completed', expiresAt: later(), response: { orderId: 'MC-DONE' } },
    });
    fetchMock.mockResolvedValueOnce(refunded());

    const out = await refundUnlessOk(capacity(), proofFor('order_gone'));

    expect(await out.json()).toMatchObject({ refunded: true });
    expect(await attempt(key)).toMatchObject({ status: 'completed', response: { orderId: 'MC-DONE' } });
  });

  it('refundPayment reports held, refunded and already refunded', async () => {
    const { proof } = await seeded();
    fetchMock.mockResolvedValue(refunded());

    expect(await refundPayment(proof)).toEqual({ outcome: 'refunded', amountPaise: 124900 });
    expect(await refundPayment(proof)).toEqual({ outcome: 'already_refunded', amountPaise: null });
    await db.order.create({
      data: { ref: `PAY-${randomUUID().slice(0, 8)}`, priceBreakdown: {}, totalPaise: 1, payablePaise: 1, deliverySlot: 'standard', leadHours: 24, razorpayPaymentId: 'pay_B' },
    });
    expect(await refundPayment(proofFor('order_unbound'))).toEqual({ outcome: 'held', amountPaise: null });
    expect(refundCalls()).toHaveLength(1);
  });
});

describe.skipIf(!url)('refund on cancel', () => {
  const fetchMock = vi.fn();
  const refundCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/payments/pay_C/refund'));
  const placed = (paymentStatus: 'none' | 'paid', razorpayPaymentId?: string) =>
    db.order
      .create({
        data: {
          ref: `PAY-${randomUUID().slice(0, 8)}`,
          status: 'confirmed',
          paymentStatus,
          razorpayPaymentId,
          priceBreakdown: {},
          totalPaise: 124900,
          payablePaise: 124900,
          deliverySlot: 'standard',
          leadHours: 24,
        },
      })
      .then((o) => o.ref);
  const row = (ref: string) => db.order.findUniqueOrThrow({ where: { ref } });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await db.portalNotification.deleteMany({ where: { orderRef: { startsWith: 'PAY-' } } });
    await db.order.deleteMany({ where: { ref: { startsWith: 'PAY-' } } }); // events and outbox rows cascade
  });

  it('cancelling a paid order refunds it', async () => {
    const ref = await placed('paid', 'pay_C');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    expect(await applyStatusTransition(ref, 'cancelled', null, 'Customer asked')).toBe(true);

    expect(await row(ref)).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
    expect(refundCalls()).toHaveLength(1);
  });

  it('a failed refund leaves the order paid', async () => {
    const ref = await placed('paid', 'pay_C');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));

    expect(await applyStatusTransition(ref, 'cancelled', null, 'Customer asked')).toBe(true);

    expect(await row(ref)).toMatchObject({ status: 'cancelled', paymentStatus: 'paid' });
  });

  it('a Razorpay outage cannot fail a cancel that has committed', async () => {
    const ref = await placed('paid', 'pay_C');
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    expect(await applyStatusTransition(ref, 'cancelled', null)).toBe(true);

    expect(await row(ref)).toMatchObject({ status: 'cancelled', paymentStatus: 'paid' });
  });

  it('an unpaid cancel calls nothing', async () => {
    const ref = await placed('none');

    expect(await applyStatusTransition(ref, 'cancelled', null)).toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await row(ref)).toMatchObject({ status: 'cancelled', paymentStatus: 'none' });
  });

  it('a cancel that does not move the order refunds nothing', async () => {
    const ref = await placed('paid', 'pay_C');
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await applyStatusTransition(ref, 'cancelled', null)).toBe(true);

    expect(await applyStatusTransition(ref, 'cancelled', null)).toBe(false); // already cancelled

    expect(refundCalls()).toHaveLength(1);
  });
});

afterAll(async () => {
  if (url) await db.$disconnect();
});
