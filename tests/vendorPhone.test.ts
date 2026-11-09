import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn(async (args?: { data: Record<string, unknown> }) => ({ id: 'v1', name: String(args?.data?.name ?? '') })) }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/assignment', () => ({ lockAssignments: vi.fn() }));
vi.mock('@/lib/catalogData', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/db', () => ({ hasDatabase: () => true, db: { vendor: { create } } }));

const { addVendor } = await import('../app/admin/actions');
const form = (phone: string) => { const f = new FormData(); f.set('name', 'Sweet Spot'); f.set('phone', phone); f.set('email', ''); f.set('address', ''); return f; };

/* A bakery's number is where WhatsApp offers go and how its button replies are matched back. */
describe('a partner bakery phone number', () => {
  beforeEach(() => create.mockClear());

  it('is stored the same way however it was typed', async () => {
    for (const typed of ['9876543210', '+91 98765 43210', '09876543210', '+91 0 98765 43210']) {
      create.mockClear();
      expect((await addVendor(undefined, form(typed))).ok, typed).toBe(true);
      expect(create.mock.calls[0][0]!.data.phone, typed).toBe('+91 98765 43210');
    }
  });

  it('may be left empty', async () => {
    expect((await addVendor(undefined, form(''))).ok).toBe(true);
    expect(create.mock.calls[0][0]!.data.phone).toBeNull();
  });

  it('is refused when WhatsApp could not reach it', async () => {
    for (const typed of ['040 2345 6789', '987654321', '91 91 98765 43210']) {
      const r = await addVendor(undefined, form(typed));
      expect(r.ok, typed).toBe(false);
      expect(r.message).toContain('10-digit Indian mobile');
    }
    expect(create).not.toHaveBeenCalled();
  });
});
