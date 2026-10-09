import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { pendingOrderAlerts, type OrderAlert } from '../components/assignment/AdminOrderPopup';

const order = { ref: 'MC-1', customerName: 'Demo', cakeName: 'Chocolate', totalPaise: 10000, addressLine1: 'Banjara Hills', city: 'Hyderabad', cakes: [] };
const alert: OrderAlert = { id: 'new', title: 'New customer order', message: 'Needs assignment', orderRef: order.ref, read: false, order };

describe('admin order popup queue', () => {
  it('excludes assigned/closed orders, read notifications and dismissed alerts', () => {
    expect(pendingOrderAlerts([{ ...alert, order: null }, { ...alert, read: true }, alert], ['new'])).toEqual([]);
  });
  it('shows one alert per order and preserves the newest rejection reason', () => {
    const rejection = { ...alert, id: 'rejection', title: 'rejected', message: 'Oven unavailable' };
    expect(pendingOrderAlerts([rejection, alert], [])).toEqual([rejection]);
    expect(pendingOrderAlerts([rejection, alert], ['new'])).toEqual([rejection]);
  });
  it('keeps an older order active when another order arrives', () => {
    const incoming = { ...alert, id: 'second', orderRef: 'MC-2', order: { ...order, ref: 'MC-2' } };
    expect(pendingOrderAlerts([incoming, alert], []).at(-1)).toEqual(alert);
  });
});
