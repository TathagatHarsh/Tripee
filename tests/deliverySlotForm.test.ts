import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateMany = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/assignment', () => ({ lockAssignments: vi.fn() }));
vi.mock('@/lib/catalogData', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/db', () => ({ hasDatabase: () => true, db: { catalogOption: { updateMany } } }));

const { saveDeliverySlot } = await import('../app/admin/actions');

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const fields = { id: 'opt1', fee: '0', leadHours: '24', slotWindow: 'Collect 10:00–21:00', slotNote: 'Ahmedguda counter.', dailyCapacity: '', cutoffHours: '', ...over };
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('saveDeliverySlot', () => {
  beforeEach(() => updateMany.mockReset().mockResolvedValue({ count: 1 }));

  it('saves a blank capacity and cutoff as null: no limit, cutoff from the lead time', async () => {
    expect(await saveDeliverySlot(undefined, form())).toEqual({ ok: true, message: 'Slot saved.' });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ slotNote: 'Ahmedguda counter.', dailyCapacity: null, cutoffHours: null });
  });

  it('still saves numbers and still refuses a capacity of 0', async () => {
    await saveDeliverySlot(undefined, form({ dailyCapacity: '25', cutoffHours: '24' }));
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ dailyCapacity: 25, cutoffHours: 24 });
    expect((await saveDeliverySlot(undefined, form({ dailyCapacity: '0' }))).ok).toBe(false);
  });
});
