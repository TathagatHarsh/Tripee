/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures poke at the message union */
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/log', () => ({ log: vi.fn() }));
vi.mock('../lib/db', () => ({ db: {} }));
const { cleanParam, customerCancelledMessage, customerConfirmedMessage, customerDeliveredMessage, customerOutForDeliveryMessage } = await import('../lib/whatsappMessages');

/*
 * The customer hears from us four times at most: confirmed, out for delivery,
 * delivered, and (only if it happens) cancelled. Each is its own approved Meta
 * template, so the parameter order below is the contract with Meta.
 */
const facts = {
  orderId: 'ord1', ref: 'MC-AB12CD', totalPaise: 125000, dueAt: new Date('2026-10-10T10:30:00Z'),
  area: 'Jubilee Hills, Hyderabad, 500033', cake: 'Chocolate Truffle · 1kg · eggless', customerName: '  Asha   Rao ',
};
const comp = (m: any, type: string) => m.components.find((c: any) => c.type === type);
const body = (m: any) => comp(m, 'body').parameters.map((p: any) => p.text);

describe("the customer's WhatsApp messages", () => {
  it('confirmed: cake photo, then [first name, cake, due, area, ref, total]', () => {
    const m = customerConfirmedMessage(facts);
    expect(m).toMatchObject({ type: 'template', name: 'customer_order_confirmed' });
    expect(comp(m, 'header').parameters[0].image.link).toContain('/api/whatsapp/photo/ord1');
    expect(body(m)).toEqual(['Asha', 'Chocolate Truffle · 1kg · eggless', 'Sat 10 Oct, 4:00 pm', 'Jubilee Hills, Hyderabad, 500033', 'MC-AB12CD', '1,250']);
  });

  it('out for delivery: cake photo, then [first name, cake, area, due, ref]', () => {
    const m = customerOutForDeliveryMessage(facts);
    expect(m).toMatchObject({ type: 'template', name: 'customer_out_for_delivery' });
    expect(comp(m, 'header').parameters[0].image.link).toContain('/api/whatsapp/photo/ord1');
    expect(body(m)).toEqual(['Asha', 'Chocolate Truffle · 1kg · eggless', 'Jubilee Hills, Hyderabad, 500033', 'Sat 10 Oct, 4:00 pm', 'MC-AB12CD']);
  });

  it('delivered: cake photo, then [first name, ref]', () => {
    const m = customerDeliveredMessage(facts);
    expect(m).toMatchObject({ type: 'template', name: 'customer_order_delivered' });
    expect(comp(m, 'header').parameters[0].image.link).toContain('/api/whatsapp/photo/ord1');
    expect(body(m)).toEqual(['Asha', 'MC-AB12CD']);
  });

  it('cancelled: no photo; says why when no bakery could take it, never a staff reason', () => {
    const none = customerCancelledMessage({ ref: 'MC-AB12CD', customerName: 'Asha' }, true);
    expect(none).toMatchObject({ type: 'template', name: 'customer_order_cancelled' });
    expect(comp(none, 'header')).toBeUndefined();
    expect(body(none)).toEqual(['Asha', 'MC-AB12CD', expect.stringContaining('No partner bakery near you')]);
    const other = body(customerCancelledMessage({ ref: 'MC-AB12CD', customerName: 'Asha' }, false));
    expect(other[2]).toContain('hello@makeyourcakes.com');
  });

  it('greets "there" when the name is missing', () => {
    for (const customerName of [null, undefined, '', '   '])
      expect(body(customerDeliveredMessage({ ...facts, customerName }))[0]).toBe('there');
  });

  it('every parameter is already Meta-clean: one line, not empty, unchanged by cleanParam', () => {
    const all = [customerConfirmedMessage(facts), customerOutForDeliveryMessage(facts), customerDeliveredMessage(facts),
      customerCancelledMessage(facts, true), customerCancelledMessage(facts, false)];
    for (const m of all) for (const t of body(m)) expect(cleanParam(t, 400)).toBe(t);
  });

  it('an ASAP or scheduled order reads as its window, not dueAt (the window end); a legacy order as before', () => {
    const scheduled = { ...facts, slot: 'scheduled', requestedFor: new Date('2026-11-20T10:00:00+05:30'), requestedWindow: '10:00–12:00', dueAt: new Date('2026-11-20T12:00:00+05:30') };
    expect(body(customerConfirmedMessage(scheduled))[2]).toBe('Fri 20 Nov, 10:00–12:00');
    expect(body(customerOutForDeliveryMessage(scheduled))[3]).toBe('Fri 20 Nov, 10:00–12:00');
    const asap = { ...facts, slot: 'asap', requestedFor: new Date('2026-11-20T13:00:00+05:30'), requestedWindow: '13:00–15:00', dueAt: new Date('2026-11-20T15:00:00+05:30') };
    expect(body(customerConfirmedMessage(asap))[2]).toBe('Fri 20 Nov, 13:00–15:00');
    const legacy = { ...facts, slot: 'standard', requestedFor: facts.dueAt, requestedWindow: '10:00–20:00' };
    expect(body(customerConfirmedMessage(legacy))[2]).toBe('Sat 10 Oct, 4:00 pm');
  });
});
