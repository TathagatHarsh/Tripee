import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  createRazorpayOrder,
  isTestKey,
  paymentMatches,
  paymentsEnabled,
  paymentCheckoutAvailable,
  requestRefund,
  verifySignature,
} from '../lib/razorpay';

const sign = (order: string, pay: string) =>
  createHmac('sha256', 'secret').update(`${order}|${pay}`).digest('hex');

const proof = (order = 'order_A', pay = 'pay_B', signature = sign('order_A', 'pay_B')) => ({
  razorpayOrderId: order,
  razorpayPaymentId: pay,
  razorpaySignature: signature,
});

const reply = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_abc');
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('verifySignature', () => {
  it('accepts the HMAC of order|payment', () => {
    expect(verifySignature(proof())).toBe(true);
  });

  it('rejects a tampered payment id', () => {
    expect(verifySignature(proof('order_A', 'pay_C', sign('order_A', 'pay_B')))).toBe(false);
  });

  it('rejects a signature of the wrong length instead of throwing', () => {
    expect(verifySignature(proof('order_A', 'pay_B', 'abcd'))).toBe(false);
  });
});

describe('paymentsEnabled / isTestKey', () => {
  it('paymentsEnabled needs both keys', () => {
    expect(paymentsEnabled()).toBe(true);
    vi.stubEnv('RAZORPAY_KEY_SECRET', '');
    expect(paymentsEnabled()).toBe(false);
  });

  it('isTestKey tells test keys from live ones', () => {
    expect(isTestKey()).toBe(true);
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_live_abc');
    expect(isTestKey()).toBe(false);
  });
});

describe('paymentMatches', () => {
  it('binds order id and amount', () => {
    const record = { razorpayOrderId: 'order_A', amountPaise: 124900 };
    expect(paymentMatches(record, proof(), 124900)).toBe(true);
    expect(paymentMatches(record, proof(), 125000)).toBe(false);
    expect(paymentMatches({ ...record, razorpayOrderId: 'order_Z' }, proof(), 124900)).toBe(false);
    expect(paymentMatches(null, proof(), 124900)).toBe(false);
  });
});

describe('createRazorpayOrder', () => {
  it('posts paise, INR and the receipt', async () => {
    const fetchMock = reply(200, { id: 'order_A' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createRazorpayOrder(124900, 'MC-ABC123')).resolves.toBe('order_A');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(JSON.parse(init.body)).toEqual({ amount: 124900, currency: 'INR', receipt: 'MC-ABC123' });
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('rzp_test_abc:secret').toString('base64')}`,
    );
  });

  it('returns null when Razorpay fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(createRazorpayOrder(124900, 'MC-ABC123')).resolves.toBeNull();

    vi.stubGlobal('fetch', reply(500, { error: 'boom' }));
    await expect(createRazorpayOrder(124900, 'MC-ABC123')).resolves.toBeNull();
  });

  it('returns null when the reply has no id', async () => {
    vi.stubGlobal('fetch', reply(200, {}));
    await expect(createRazorpayOrder(124900, 'MC-ABC123')).resolves.toBeNull();
  });
});

describe('refund requests', () => {
  it('validates the gateway refund and sends the stable idempotency key', async () => {
    const fetchMock = reply(200, { id: 'rfnd_1', payment_id: 'pay_B', status: 'pending' });
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestRefund('pay_B', null)).resolves.toMatchObject({ status: 'pending', id: 'rfnd_1' });
    expect(fetchMock.mock.calls[0][1].headers['X-Refund-Idempotency']).toBe('tripee-full-pay_B');
  });
  it('does not accept a success HTTP response without a refund entity', async () => {
    vi.stubGlobal('fetch', reply(200, {}));
    await expect(requestRefund('pay_B', null)).rejects.toThrow();
  });
  it('rejects a refund belonging to another payment', async () => {
    vi.stubGlobal('fetch', reply(200, { id: 'rfnd_1', payment_id: 'pay_other', status: 'processed' }));
    await expect(requestRefund('pay_B', null)).rejects.toThrow('Refund payment mismatch');
  });
});

describe('timeouts', () => {
  it('gives up on Razorpay after 10 seconds, as a failure', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    // A hung Razorpay: the request only ends when its signal aborts.
    const hung = vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    });
    vi.stubGlobal('fetch', hung);
    timeout.mockImplementation(() => AbortSignal.abort(new DOMException('timed out', 'TimeoutError')));

    await expect(requestRefund('pay_B', null)).rejects.toThrow();
    await expect(createRazorpayOrder(124900, 'MC-ABC123')).resolves.toBeNull();
    expect(timeout).toHaveBeenCalledWith(10_000);
  });
});

describe('production charge readiness', () => {
  it('blocks new production charges until recovery secrets are configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', ''); vi.stubEnv('PAYMENT_WORKER_SECRET', '');
    expect(paymentCheckoutAvailable()).toBe(false);
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'webhook'); vi.stubEnv('PAYMENT_WORKER_SECRET', 'worker');
    expect(paymentCheckoutAvailable()).toBe(true);
  });
});
