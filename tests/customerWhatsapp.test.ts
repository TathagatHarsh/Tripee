import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { customerUpdateText } = await import('../lib/whatsappEvents');
const { cleanParam } = await import('../lib/whatsappMessages');

/*
 * The customer's WhatsApp updates go in the approved `order_update` template:
 * "Update on cake order {{1}}: {{2}}. If you have any questions…". {{2}} must
 * survive Meta's parameter rules unchanged and must not end in its own full stop.
 */
describe("the customer's WhatsApp update at each step", () => {
  const steps = ['placed', 'confirmed', 'in_kitchen', 'out_for_delivery', 'delivered', 'cancelled'] as const;

  it('has a message for every step a customer cares about, and none for a draft', () => {
    for (const s of steps) expect(customerUpdateText(s, false), s).toBeTruthy();
    expect(customerUpdateText('draft', false)).toBeNull();
  });

  it('fits the template: one line, no trailing full stop, unchanged by cleanParam', () => {
    for (const s of steps) for (const pickup of [false, true]) {
      const t = customerUpdateText(s, pickup, 'Pineapple Delight · 1kg · eggless')!;
      expect(t.endsWith('.')).toBe(false);
      expect(cleanParam(t, 400)).toBe(t);
    }
  });

  it('names the cake when the order is placed, and says it is on its way when sent out', () => {
    expect(customerUpdateText('placed', false, 'Pineapple Delight · 1kg')).toContain('for Pineapple Delight · 1kg');
    expect(customerUpdateText('out_for_delivery', false)).toContain('on its way');
    expect(customerUpdateText('out_for_delivery', true)).toContain('ready to collect');
  });
});
