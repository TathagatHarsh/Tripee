import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
const requireAdmin = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAdmin }));
vi.mock('@/lib/assignment', () => ({ lockAssignments: vi.fn() }));
vi.mock('@/lib/catalogData', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/db', () => ({ hasDatabase: () => true, db: { deliverySettings: { upsert } } }));

const { saveDeliveryRules } = await import('../app/admin/actions');

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const fields = {
    fee: '150', ordersFrom: '08:00', ordersUntil: '18:00', readyMin: '2', readyMax: '4',
    customMin: '3', customMax: '4', windowMinutes: '120', preorderDays: '14', ...over,
  };
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('saveDeliveryRules', () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({});
    requireAdmin.mockReset().mockResolvedValue(undefined);
  });

  it('saves valid rules as minutes', async () => {
    expect((await saveDeliveryRules(undefined, form({ readyMin: '2.5' }))).ok).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'singleton' });
    expect(arg.update).toMatchObject({
      feePaise: 15000, ordersFrom: '08:00', ordersUntil: '18:00', readyMinMinutes: 150,
      readyMaxMinutes: 240, customMinMinutes: 180, customMaxMinutes: 240, windowMinutes: 120, preorderDays: 14,
    });
  });

  it('refuses non-admins', async () => {
    requireAdmin.mockRejectedValue(new Error('redirect'));
    await expect(saveDeliveryRules(undefined, form())).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects ordersUntil before ordersFrom', async () => {
    expect(await saveDeliveryRules(undefined, form({ ordersUntil: '08:00' }))).toEqual({
      ok: false, message: 'Orders must close after they open.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects min above max', async () => {
    expect(await saveDeliveryRules(undefined, form({ readyMin: '5' }))).toEqual({
      ok: false, message: 'Ready-made: minimum must not exceed maximum.',
    });
    expect(await saveDeliveryRules(undefined, form({ customMin: '5' }))).toEqual({
      ok: false, message: 'Custom: minimum must not exceed maximum.',
    });
  });

  it("rejects a window length that isn't 1, 2 or 3 hours", async () => {
    for (const w of ['0', '-60', '90', '30', 'abc', '']) {
      expect((await saveDeliveryRules(undefined, form({ windowMinutes: w }))).ok).toBe(false);
    }
    expect(upsert).not.toHaveBeenCalled();
  });
});
