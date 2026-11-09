import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn((args: unknown) => args);
const deleteMany = vi.fn();
const $transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/assignment', () => ({ lockAssignments: vi.fn() }));
vi.mock('@/lib/catalogData', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/db', () => ({ hasDatabase: () => true, db: { fulfillmentBlackout: { upsert, deleteMany }, $transaction } }));

const { addClosedDay, reopenDay } = await import('../app/admin/actions');

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('closed days', () => {
  beforeEach(() => { upsert.mockClear(); deleteMany.mockClear(); $transaction.mockClear(); });

  it('closes a future date for delivery and pickup, with a default note for customers', async () => {
    expect((await addClosedDay(undefined, form({ date: '2099-11-01', reason: '' }))).ok).toBe(true);
    const methods = upsert.mock.calls.map(([a]) => (a as { create: { method: string } }).create.method);
    expect(methods).toEqual(['delivery', 'pickup']);
    const first = upsert.mock.calls[0][0] as { create: { date: Date; reason: string } };
    expect(first.create.date.toISOString()).toBe('2099-11-01T00:00:00.000Z');
    expect(first.create.reason).toMatch(/closed on this day/);
  });

  it('refuses a date that has passed, and a missing date', async () => {
    expect((await addClosedDay(undefined, form({ date: '2020-01-01', reason: '' }))).ok).toBe(false);
    expect((await addClosedDay(undefined, form({ date: '', reason: '' }))).ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('opens a day again by removing every row for that date', async () => {
    await reopenDay(form({ date: '2099-11-01' }));
    expect(deleteMany).toHaveBeenCalledWith({ where: { date: new Date('2099-11-01T00:00:00.000Z') } });
    await reopenDay(form({ date: 'not-a-date' }));
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});
