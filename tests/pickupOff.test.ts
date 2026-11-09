import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PICKUP_OPEN } from '@/lib/delivery';

/*
 * Pickup is switched off until the bakery takes collections. The checkout
 * screen hides it, but the order endpoint is the real gate: a crafted request
 * must be refused there, before any price or capacity work.
 */
describe('pickup while the bakery does not take collections', () => {
  it('is switched off', () => {
    expect(PICKUP_OPEN).toBe(false);
  });

  it('is refused by the server-side order check, by method or by slot', () => {
    const src = readFileSync('lib/checkoutValidate.ts', 'utf8');
    expect(src).toMatch(/!PICKUP_OPEN && \(body\.fulfillment\.method === "pickup" \|\| body\.fulfillment\.slot === "pickup"\)/);
    expect(src.indexOf('pickup_unavailable')).toBeLessThan(src.indexOf('reviewBasket(items'));
  });

  it('is not offered at checkout', () => {
    const src = readFileSync('app/checkout/CheckoutForm.tsx', 'utf8');
    expect(src).toContain('{PICKUP_OPEN && <fieldset');
    expect(src).toContain('onPickup={PICKUP_OPEN ?');
  });
});
