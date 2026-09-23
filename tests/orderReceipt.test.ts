import { expect, it } from 'vitest';
import { OrderReceipt } from '@/lib/orderReceipt';
const saved = { ref: 'MC-ABC234', totalPaise: 120000, date: '2026-12-24', window: '10:00–20:00', address: 'Server saved address', items: [{name: 'Cake',variant: '1 kg',qty: 1}] };
it('accepts persisted receipts and authoritative pickup/delivery responses', () => {
  expect(OrderReceipt.safeParse(saved).success).toBe(true);
  expect(OrderReceipt.safeParse({...saved,method:'pickup',date:null}).success).toBe(true);
});
it('refuses incomplete, invalid-date and invalid-price responses before celebrating', () => {
  for (const bad of [{ref:saved.ref,totalPaise:120000}, {...saved, date:'2026-99-99'}, {...saved,totalPaise:-1}, {...saved,ref:'not-an-order'}]) {
    expect(OrderReceipt.safeParse(bad).success).toBe(false);
  }
});
