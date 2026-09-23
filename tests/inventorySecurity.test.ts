import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), transaction: vi.fn(), vendor: vi.fn(), inventory: vi.fn(), candidates: vi.fn(), assign: vi.fn() }));
vi.mock('../lib/auth', () => ({ getViewer: mocks.viewer }));
vi.mock('../lib/db', () => ({ db: { $transaction: mocks.transaction, vendor: { findFirst: mocks.vendor } } }));
vi.mock('../lib/assignment', () => ({ lockAssignments: vi.fn(), assignmentCandidates: mocks.candidates, manualAssignment: mocks.assign, AssignmentConflict: class extends Error {} }));
import { POST as updateInventory } from '../app/api/inventory/route';
import { GET as candidates, POST as assign } from '../app/api/assignments/[ref]/route';
import { portalScope } from '../lib/portalScope';
const request = (data: unknown) => new Request('http://localhost/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
describe('portal authorization boundaries', () => {
  beforeEach(() => vi.clearAllMocks());
  it('denies anonymous and customer inventory writes before DB access', async () => {
    for (const viewer of [null, { userId: 'customer', profile: { role: 'CUSTOMER' } }]) {
      mocks.viewer.mockResolvedValue(viewer);
      expect((await updateInventory(request({}))).status).toBe(403);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('prevents vendors from modifying another bakery inventory', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'vendor-a', profile: { role: 'VENDOR', vendorId: 'bakery-a' } });
    const response = await updateInventory(request({ vendorId: 'bakery-b', id: 'private-item', isAvailable: true }));
    expect(response.status).toBe(403); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('scopes item lookup to the vendor even when an item id is forged', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'vendor-a', profile: { role: 'VENDOR', vendorId: 'bakery-a' } });
    const findFirst = vi.fn().mockResolvedValue(null);
    mocks.transaction.mockImplementation(async fn => fn({ vendor: { findUnique: async () => ({ isActive: true }) }, vendorInventory: { findFirst } }));
    expect((await updateInventory(request({ vendorId: 'bakery-a', id: 'other-item', isAvailable: false }))).status).toBe(409);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'other-item', vendorId: 'bakery-a' } });
  });
  it('writes a silent audit with the session actor and both states', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'vendor-a', profile: { role: 'VENDOR', vendorId: 'bakery-a' } });
    const create = vi.fn(), update = vi.fn();
    mocks.transaction.mockImplementation(async fn => fn({ vendor: { findUnique: async () => ({ isActive: true }) }, vendorInventory: { findFirst: async () => ({ id: 'item', isAvailable: true }), update }, inventoryAvailabilityChange: { create } }));
    const response = await updateInventory(request({ vendorId: 'bakery-a', id: 'item', isAvailable: false }));
    expect(await response.json()).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({ data: { inventoryId: 'item', previousAvailable: true, newAvailable: false, userId: 'vendor-a' } });
  });
  it('validates the entire selected variant batch before any writes', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'admin', profile: { role: 'ADMIN' } });
    const create = vi.fn();
    mocks.transaction.mockImplementation(async fn => fn({ vendor: { findUnique: async () => ({ isActive: true }) }, cakeVariant: { findMany: async () => [{ id: 'valid' }] }, vendorInventory: { create } }));
    expect((await updateInventory(request({ vendorId: 'bakery', variantIds: ['valid', 'missing'] }))).status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });
  it('deduplicates adds and preserves existing availability on retry', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'admin', profile: { role: 'ADMIN' } });
    const create = vi.fn().mockResolvedValue({ id: 'new-item' }), audit = vi.fn();
    const variant = { id: 'v', cakeId: 'cake', sizeBand: '2kg', eggType: 'eggless', cake: { name: 'Cake' } };
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ isAvailable: false });
    const findMany = vi.fn().mockResolvedValue([variant]);
    mocks.transaction.mockImplementation(async fn => fn({ vendor: { findUnique: async () => ({ isActive: true }) }, cakeVariant: { findMany }, vendorInventory: { findUnique, create }, inventoryAvailabilityChange: { create: audit } }));
    for (let n = 0; n < 2; n++) expect((await updateInventory(request({ vendorId: 'bakery', variantIds: ['v', 'v'] }))).status).toBe(200);
    expect(findMany.mock.calls[0][0].where.id.in).toEqual(['v']);
    expect(create).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({ data: { inventoryId: 'new-item', previousAvailable: null, newAvailable: true, userId: 'admin' } });
  });
  it('rejects inactive vendors and malformed or mixed mutation payloads', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'vendor-a', profile: { role: 'VENDOR', vendorId: 'bakery-a' } });
    mocks.transaction.mockImplementation(async fn => fn({ vendor: { findUnique: async () => ({ isActive: false }) } }));
    expect((await updateInventory(request({ vendorId: 'bakery-a', variantIds: ['v'] }))).status).toBe(409);
    for (const body of [{ variantIds: [] }, { id: 'x', isAvailable: 'false' }, { id: 'x', isAvailable: true, variantIds: ['v'] }]) {
      expect((await updateInventory(request({ vendorId: 'bakery-a', ...body }))).status).toBe(400);
    }
  });
  it('blocks candidate inventory inspection and assignment by vendors', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'vendor-a', profile: { role: 'VENDOR', vendorId: 'bakery-a' } });
    const context = { params: Promise.resolve({ ref: 'MC-private' }) };
    expect((await candidates(new Request('http://localhost/api/assignments/MC-private?eligible=true'), context)).status).toBe(403);
    expect((await assign(request({ action: 'manual', vendorId: 'bakery-a', expectedAssignmentId: null }), context)).status).toBe(403);
    expect(mocks.candidates).not.toHaveBeenCalled(); expect(mocks.assign).not.toHaveBeenCalled();
  });
  it('rejects capacity override commands at the assignment boundary', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'admin', profile: { id: 'admin', role: 'ADMIN' } });
    const response = await assign(request({ action: 'manual', vendorId: 'bakery', expectedAssignmentId: null, overrideCapacity: true }), { params: Promise.resolve({ ref: 'MC-test' }) });
    expect(response.status).toBe(400);
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it('scopes notifications to the session bakery and denies deactivated vendors', async () => {
    mocks.viewer.mockResolvedValue({ userId: 'vendor-a', profile: { role: 'VENDOR', vendorId: 'bakery-a' } });
    mocks.vendor.mockResolvedValue({ id: 'bakery-a' });
    expect((await portalScope())?.where).toEqual({ vendorId: 'bakery-a' });
    mocks.vendor.mockResolvedValue(null); expect(await portalScope()).toBeNull();
  });
  it('rejects cross-site stock mutations', async () => {
    const response = await updateInventory(new Request('http://localhost/api/inventory', { method: 'POST', headers: { origin: 'https://other.example', host: 'localhost' }, body: '{}' }));
    expect(response.status).toBe(403); expect(mocks.viewer).not.toHaveBeenCalled();
  });
});
