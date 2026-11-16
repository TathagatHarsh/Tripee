import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../app/admin/actions', () => ({ advanceOrderStatus: vi.fn() }));
vi.mock('../components/admin/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OrderPanel } from '../components/admin/OrderPanel';
import type { OrderPanelData } from '../lib/orderPanelData';

const base: OrderPanelData = {
  ref: 'MC-1053',
  status: 'draft',
  createdAt: new Date(Date.now() - 4 * 60_000),
  paymentStatus: 'none',
  totalPaise: 125000,
  cakes: [{ name: 'Black forest', size: '1kg', eggType: 'eggless', message: 'Happy 30th Ananya!', photoUrl: null }],
  fulfillmentMethod: 'delivery',
  deliverySlot: 'standard',
  deliveryWindow: 'Today 6–7 pm',
  due: new Date(Date.now() + 3 * 3600_000),
  deliveryLocation: { line1: '12 Road No 3', area: 'Banjara Hills', latitude: 17.4, longitude: 78.4 },
  customerName: 'Riya S',
  customerPhone: '+919876543210',
  attempts: [],
  bakeryLine: 'waiting for confirmation',
  attemptLines: ['Cocoa Lane said no (out of mango) · 1:00 pm', 'Offered to Sweet Crumbs · waiting 2 min'],
  callCustomerHref: 'tel:+919876543210',
  whatsappHref: 'https://wa.me/919876543210?text=Hi',
  callBakeryHref: 'tel:+919000000002',
};
const render = (data: OrderPanelData | null) => renderToStaticMarkup(createElement(OrderPanel, { data, closeHref: '/admin/orders?view=today' }));

describe('OrderPanel', () => {
  it("not found renders 'Order not found' and close link to closeHref", () => {
    const html = render(null);
    expect(html).toContain('Order not found');
    expect(html).toContain('href="/admin/orders?view=today"');
  });

  it('draft shows Confirm; confirmed does not', () => {
    expect(render(base)).toMatch(/value="confirmed"/);
    expect(render({ ...base, status: 'confirmed' })).not.toMatch(/value="confirmed"/);
  });

  it('shows the cake, message, customer and the call/whatsapp links', () => {
    const html = render(base);
    expect(html).toContain('Black forest');
    expect(html).toContain('Happy 30th Ananya!');
    expect(html).toContain('Riya S');
    expect(html).toContain('Today 6–7 pm');
    expect(html).toContain('href="tel:+919876543210"');
    expect(html).toContain('href="https://wa.me/919876543210?text=Hi"');
    expect(html).toContain('href="tel:+919000000002"');
  });

  it('sits below the sticky admin header on laptop', () => {
    const html = render(base);
    expect(html).toContain('lg:top-[4.5rem]');
    expect(html).toContain('lg:max-h-[calc(100dvh-5.5rem)]');
  });

  it('pickup shows Pickup', () => {
    const html = render({ ...base, fulfillmentMethod: 'pickup', deliverySlot: 'pickup' });
    expect(html).toContain('Pickup');
    expect(html).not.toContain('12 Road No 3');
  });

  it('hides Call bakery when callBakeryHref is null', () => {
    expect(render({ ...base, callBakeryHref: null })).not.toContain('Call bakery');
  });

  it('renders attempt lines in order', () => {
    const html = render(base);
    expect(html.indexOf('Cocoa Lane said no')).toBeLessThan(html.indexOf('Offered to Sweet Crumbs'));
  });

  it('Open full order links to /admin/orders/<ref>', () => {
    expect(render(base)).toContain('href="/admin/orders/MC-1053"');
  });

  it('no element offers manual assignment', () => {
    expect(render(base)).not.toMatch(/Assign/);
  });
});
