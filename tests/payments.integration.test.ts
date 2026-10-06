import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '../lib/db';
import { openPaymentIntent } from '../lib/checkoutPayment';

/**
 * The payment-intent binding on a checkout attempt, against an isolated
 * database like the other *.integration suites. Razorpay itself is a stubbed fetch.
 */
const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
const keys: string[] = [];
const freshKey = () => {
  const key = randomUUID();
  keys.push(key);
  return key;
};

const orderReply = (id: string) => new Response(JSON.stringify({ id }), { status: 200 });
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
    await db.$disconnect();
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
});
