import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/auth', () => ({ getViewer: async () => null }));
vi.mock('../lib/guestOrders', () => ({ rememberGuestOrders: async () => {} }));
// .env holds the live database URL: no case here may reach a client.
vi.mock('../lib/db', () => ({ db: {}, hasDatabase: () => false, NO_DATABASE_MESSAGE: 'no db' }));
import { POST } from '../app/api/orders/route';

/** The payment gate in front of /api/orders: these all return before a database is needed. */
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/orders', { method: 'POST', body: JSON.stringify(body) }));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/orders payment gate', () => {
  it('payments on: no proof is 402 payment_required', async () => {
    const res = await post({});

    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'payment_required' });
  });

  it('payments on: a bad signature is 400 payment_invalid', async () => {
    const res = await post({
      idempotencyKey: randomUUID(),
      payment: { razorpayOrderId: 'order_A', razorpayPaymentId: 'pay_B', razorpaySignature: '0'.repeat(64) },
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'payment_invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('payments off: a body without proof is not 402', async () => {
    vi.stubEnv('RAZORPAY_KEY_SECRET', '');

    const res = await post({});

    expect(res.status).not.toBe(402);
  });
});
