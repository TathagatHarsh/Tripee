import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { candidates } = vi.hoisted(() => ({ candidates: [
  { vendorId: 'busy', name: 'Busy bakery', eligible: false, reasons: ['At capacity'], distanceKm: 1, source: 'pickup', preparationMinutes: 30, currentLoad: 2, capacity: 2, inventory: [{ product: 'Vanilla', isAvailable: true }] },
  { vendorId: 'ready', name: 'Ready bakery', eligible: true, reasons: [], distanceKm: 2, source: 'pickup', preparationMinutes: 30, currentLoad: 0, capacity: 2, inventory: [{ product: 'Chocolate', isAvailable: true }] },
  { vendorId: 'unavailable', name: 'Unavailable bakery', eligible: false, reasons: ['Cake unavailable'], distanceKm: null, source: 'unknown', preparationMinutes: 30, currentLoad: 0, capacity: 2, inventory: [{ product: 'Strawberry', isAvailable: false }] },
] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  let call = 0;
  return { ...actual, useState: (initial: unknown) => {
    // Render the loaded picker, with server-ranked fixtures deliberately unsorted.
    const slot = call++ % 7;
    return actual.useState(slot === 1 ? candidates : slot === 2 ? false : initial);
  } };
});
import { AssignVendor } from '@/app/admin/orders/[ref]/AssignVendor';

describe('binary cake availability assignment picker', () => {
  it('groups eligible bakeries first and offers assignment only for eligible rows', () => {
    const html = renderToStaticMarkup(createElement(AssignVendor, { orderRef: 'MC-TEST', assigned: null, assignmentId: null, vendors: [] }));
    expect(html.indexOf('Ready bakery')).toBeLessThan(html.indexOf('Busy bakery'));
    expect(html).toContain('Eligible bakeries');
    expect(html).toContain('Unavailable bakeries');
    expect(html).toContain('Location unavailable');
    expect(html).toContain('Assign Ready bakery');
    expect(html).not.toContain('Assign Busy bakery');
    expect(html).not.toContain('Assign Unavailable bakery');
    expect(html).toContain('Chocolate · <strong>Available</strong>');
    expect(html).toContain('Strawberry · <strong>Unavailable</strong>');
    expect(html).not.toMatch(/reserv|override|stock|undefined/i);
  });
});
