import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const recover = vi.hoisted(() => vi.fn());
vi.mock('../lib/paymentRecovery', () => ({ recoverPayment: recover }));
import { POST } from '../app/api/webhooks/razorpay/route';
beforeEach(() => { vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'test-webhook-secret'); recover.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_123' } } } });
const signed = (body = raw) => new Request('http://localhost/api/webhooks/razorpay', { method: 'POST', body,
  headers: { 'x-razorpay-signature': createHmac('sha256', 'test-webhook-secret').update(raw).digest('hex') } });
it('rejects a modified body before recovering a payment', async () => {
  expect((await POST(signed(raw.replace('pay_123', 'pay_456')))).status).toBe(401);
  expect(recover).not.toHaveBeenCalled();
});
it('verifies the raw body and delegates duplicate-safe recovery', async () => {
  expect((await POST(signed())).status).toBe(200);
  expect(recover).toHaveBeenCalledWith('pay_123');
});
it('asks Razorpay to retry when recovery fails', async () => {
  recover.mockRejectedValue(new Error('temporary outage'));
  expect((await POST(signed())).status).toBe(503);
});
it('fails closed without a configured webhook secret', async () => {
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '');
  expect((await POST(signed())).status).toBe(503);
  expect(recover).not.toHaveBeenCalled();
});
