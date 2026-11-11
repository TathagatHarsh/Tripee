import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { orderConfirmationEmail, queueOrderConfirmationEmail } from '../lib/orderEmail';

const facts = {
  ref: 'MYC-ABC123',
  customerName: 'Asha <b>&</b>',
  cakes: ['Chocolate truffle · 1 kg'],
  totalPaise: 129900,
  pickup: false,
  dueAt: new Date('2026-11-12T10:30:00Z'),
  slot: 'morning',
  address: '12 MG Road, Hyderabad, Telangana, 500001',
};

let order: Record<string, unknown>;
const tx = {
  order: { findUniqueOrThrow: vi.fn(async () => order) },
  notificationOutbox: { upsert: vi.fn(async () => ({})) },
};

beforeEach(() => {
  order = {
    ref: 'MYC-ABC123', customerName: 'Asha', customerEmail: null, cakeName: 'Chocolate truffle', totalPaise: 129900,
    fulfillmentMethod: 'delivery', dueAt: null, requestedFor: new Date('2026-11-12T10:30:00Z'), deliverySlot: 'morning',
    addressLine1: '12 MG Road', addressLine2: null, city: 'Hyderabad', state: 'Telangana', pincode: '500001',
    cakes: [{ cakeName: 'Chocolate truffle · 1 kg' }],
  };
  vi.stubEnv('RESEND_API_KEY', '');
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('orderConfirmationEmail', () => {
  it('has the subject, total, ref, cake, address and tracking link', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://makeyourcakes.com');
    const e = orderConfirmationEmail(facts);
    expect(e.subject).toBe('Your MakeYourCakes order MYC-ABC123 is confirmed');
    for (const part of [e.text, e.html]) {
      expect(part).toContain('MYC-ABC123');
      expect(part).toContain('1,299');
      expect(part).toContain('Chocolate truffle');
      expect(part).toContain('12 MG Road');
      expect(part).toContain('https://makeyourcakes.com/orders/MYC-ABC123');
    }
  });

  it('escapes customer text in html only', () => {
    const e = orderConfirmationEmail(facts);
    expect(e.html).toContain('Asha &lt;b&gt;&amp;&lt;/b&gt;');
    expect(e.html).not.toContain('<b>&</b>');
    expect(e.text).toContain('Asha <b>&</b>');
  });

  it('says pickup and omits the address for a pickup order', () => {
    const e = orderConfirmationEmail({ ...facts, pickup: true, address: null });
    expect(e.text).toMatch(/pick ?up/i);
    expect(e.text).not.toContain('12 MG Road');
  });
});

describe('queueOrderConfirmationEmail', () => {
  it('queues nothing without RESEND_API_KEY, or with a blank email', async () => {
    order.customerEmail = 'asha@example.com';
    expect(await queueOrderConfirmationEmail(tx as never, 'o1')).toBe(false);
    vi.stubEnv('RESEND_API_KEY', 're_test');
    order.customerEmail = '   ';
    expect(await queueOrderConfirmationEmail(tx as never, 'o1')).toBe(false);
    expect(tx.notificationOutbox.upsert).not.toHaveBeenCalled();
  });

  it('upserts one email row keyed on the order', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    order.customerEmail = ' Asha@Example.com ';
    expect(await queueOrderConfirmationEmail(tx as never, 'o1')).toBe(true);
    const arg = (tx.notificationOutbox.upsert.mock.calls as unknown as [{ where: unknown; update: unknown; create: { payload: { subject: string } } }][])[0][0];
    expect(arg.where).toEqual({ dedupeKey: 'email:order:o1:confirmed' });
    expect(arg.update).toEqual({});
    expect(arg.create).toMatchObject({ orderId: 'o1', kind: 'new_order', channel: 'email', destination: 'asha@example.com' });
    expect(arg.create.payload.subject).toContain('is confirmed');
  });
});
