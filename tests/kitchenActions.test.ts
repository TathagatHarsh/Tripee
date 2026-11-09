import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyStatusTransition = vi.fn();
vi.mock('@/lib/auth', () => ({ requireKitchen: async () => ({ profile: { id: 'baker' } }) }));
vi.mock('@/lib/db', () => ({ hasDatabase: () => true }));
vi.mock('@/lib/orderTransition', () => ({ applyStatusTransition: (...a: unknown[]) => applyStatusTransition(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { advanceOrder } = await import('../app/kitchen/actions');
const post = (to: string) => { const f = new FormData(); f.set('ref', 'MC-ABC123'); f.set('to', to); return advanceOrder(f); };

describe('kitchen board moves', () => {
  beforeEach(() => applyStatusTransition.mockClear());

  it('refuses a cancel, which only the office may make', async () => {
    await post('cancelled');
    expect(applyStatusTransition).not.toHaveBeenCalled();
  });

  it('passes forward moves on to the shared transition', async () => {
    await post('in_kitchen');
    expect(applyStatusTransition).toHaveBeenCalledWith('MC-ABC123', 'in_kitchen', 'baker');
  });
});
