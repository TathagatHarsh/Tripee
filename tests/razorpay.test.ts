import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  createRazorpayOrder,
  isTestKey,
  paymentMatches,
  paymentsEnabled,
  refund,
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

describe('refund', () => {
  it('reports success and failure', async () => {
    const ok = reply(200, { id: 'rfnd_1' });
    vi.stubGlobal('fetch', ok);
    await expect(refund('pay_B')).resolves.toBe(true);
    expect(ok.mock.calls[0][0]).toMatch(/\/payments\/pay_B\/refund$/);
    expect(JSON.parse(ok.mock.calls[0][1].body)).toEqual({});

    vi.stubGlobal('fetch', reply(400, { error: 'nope' }));
    await expect(refund('pay_B')).resolves.toBe(false);
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

    await expect(refund('pay_B')).resolves.toBe(false);
    await expect(createRazorpayOrder(124900, 'MC-ABC123')).resolves.toBeNull();
    expect(timeout).toHaveBeenCalledWith(10_000);
  });
});
