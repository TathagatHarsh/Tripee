import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), transaction: vi.fn() }));
vi.mock('../lib/auth', () => ({ getViewer: mocks.viewer }));
vi.mock('../lib/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('../lib/assignment', () => ({ lockAssignments: vi.fn() }));
vi.mock('../lib/portalNotifications', () => ({ portalEvent: vi.fn() }));
import { POST } from '../app/api/vendor/availability/route';

const request = (data: unknown) => new Request('http://localhost/api/vendor/availability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const run = (vendor: object | null, update = vi.fn().mockResolvedValue({ id: 'v1', updatedAt: new Date() })) => {
  mocks.viewer.mockResolvedValue({ userId: 'u', profile: { role: 'VENDOR', vendorId: 'v1' } });
  mocks.transaction.mockImplementation(async fn => fn({ vendor: { findUnique: async () => vendor, update } }));
  return update;
};
describe('vendor availability route', () => {
  beforeEach(() => vi.clearAllMocks());
  it('refuses accepting or busy until the bakery is approved', async () => {
    for (const availability of ['accepting', 'busy']) {
      const update = run({ id: 'v1', name: 'B', isActive: false });
      const res = await POST(request({ availability, preparationMinutes: 60, capacity: 3 }));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Available once MakeYourCakes approves your bakery' });
      expect(update).not.toHaveBeenCalled();
    }
  });
  it('lets an unapproved bakery save details with closed', async () => {
    const update = run({ id: 'v1', name: 'B', isActive: false });
    expect((await POST(request({ availability: 'closed', preparationMinutes: 60, capacity: 3 }))).status).toBe(200);
    expect(update).toHaveBeenCalled();
  });
  it('saves the radius and confirms details', async () => {
    const update = run({ id: 'v1', name: 'B', isActive: true });
    expect((await POST(request({ availability: 'accepting', preparationMinutes: 90, capacity: 4, radiusKm: 8 }))).status).toBe(200);
    const data = update.mock.calls[0][0].data;
    expect(data.serviceRadiusKm).toBe(8);
    expect(data.detailsConfirmedAt).toBeInstanceOf(Date);
  });
  it('rejects a radius outside 1 to 50', async () => {
    for (const radiusKm of [0, 51]) expect((await POST(request({ availability: 'closed', preparationMinutes: 60, capacity: 3, radiusKm }))).status).toBe(400);
  });
});
