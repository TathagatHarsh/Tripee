import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/auth', () => ({ requireAdmin: async () => ({ userId: 'test-admin', profile: { id: 'test-admin', role: 'ADMIN' } }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
import { db } from '../lib/db';
import { acceptInvite, issueInvite } from '../lib/vendorInvite';
import { addVendor, approveVendor, resendInvite } from '../app/admin/actions';

const url = process.env.ASSIGNMENT_TEST_DATABASE_URL;
let serial = Date.now();
const tokenOf = (link: string) => link.split('/join/')[1];
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

async function bakery() {
  const vendor = await db.vendor.create({ data: { name: `Invite bakery ${++serial}`, isActive: false } });
  return { vendor, ...(await issueInvite(vendor.id)) };
}
const user = (role: 'CUSTOMER' | 'ADMIN' | 'KITCHEN' | 'VENDOR' = 'CUSTOMER', vendorId?: string) =>
  db.userProfile.create({ data: { id: `inv-user-${++serial}`, name: 'Baker', role, vendorId } });

describe.skipIf(!url)('bakery invites on isolated PostgreSQL', () => {
  beforeAll(() => { process.env.DATABASE_URL = url!; });
  afterAll(async () => db.$disconnect());

  it('a valid invite makes the account that bakery\'s baker and burns the token', async () => {
    const b = await bakery(); const u = await user();
    expect(await acceptInvite(tokenOf(b.link), u.id)).toEqual({ ok: true });
    const p = await db.userProfile.findUniqueOrThrow({ where: { id: u.id } });
    expect([p.role, p.vendorId]).toEqual(['VENDOR', b.vendor.id]);
    const v = await db.vendor.findUniqueOrThrow({ where: { id: b.vendor.id } });
    expect([v.inviteTokenHash, v.inviteExpiresAt]).toEqual([null, null]);
  });

  it('an expired token is refused', async () => {
    const b = await bakery(); const u = await user();
    await db.vendor.update({ where: { id: b.vendor.id }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    expect(await acceptInvite(tokenOf(b.link), u.id)).toEqual({ ok: false, reason: 'expired' });
    expect((await db.userProfile.findUniqueOrThrow({ where: { id: u.id } })).role).toBe('CUSTOMER');
  });

  it('a token cannot be used twice, nor a made-up one', async () => {
    const b = await bakery(); const [u1, u2] = [await user(), await user()];
    await acceptInvite(tokenOf(b.link), u1.id);
    expect(await acceptInvite(tokenOf(b.link), u2.id)).toEqual({ ok: false, reason: 'expired' });
    expect(await acceptInvite('nope', u2.id)).toEqual({ ok: false, reason: 'expired' });
    expect((await db.userProfile.findUniqueOrThrow({ where: { id: u2.id } })).role).toBe('CUSTOMER');
  });

  it('two accepts at once let exactly one through', async () => {
    const b = await bakery(); const [u1, u2] = [await user(), await user()];
    const r = await Promise.all([acceptInvite(tokenOf(b.link), u1.id), acceptInvite(tokenOf(b.link), u2.id)]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });

  it('resending replaces the old token', async () => {
    const b = await bakery(); const u = await user();
    const again = await issueInvite(b.vendor.id);
    expect(await acceptInvite(tokenOf(b.link), u.id)).toEqual({ ok: false, reason: 'expired' });
    expect(await acceptInvite(tokenOf(again.link), u.id)).toEqual({ ok: true });
  });

  it('staff and other bakeries\' bakers are refused and left unchanged', async () => {
    const b = await bakery(); const other = await bakery();
    for (const [p, reason] of [
      [await user('ADMIN'), 'staff'], [await user('KITCHEN'), 'staff'], [await user('VENDOR', other.vendor.id), 'other_bakery'],
    ] as const) {
      expect(await acceptInvite(tokenOf(b.link), p.id)).toEqual({ ok: false, reason });
      const after = await db.userProfile.findUniqueOrThrow({ where: { id: p.id } });
      expect([after.role, after.vendorId]).toEqual([p.role, p.vendorId]);
    }
    expect((await db.vendor.findUniqueOrThrow({ where: { id: b.vendor.id } })).inviteTokenHash).not.toBeNull();
  });

  it('a baker of the same bakery is simply ok', async () => {
    const b = await bakery(); const u = await user('VENDOR', b.vendor.id);
    expect(await acceptInvite(tokenOf(b.link), u.id)).toEqual({ ok: true });
  });

  it('a customer with orders keeps them', async () => {
    const b = await bakery(); const u = await user();
    const o = await db.order.create({ data: { ref: `INV-${++serial}`, config: {}, priceBreakdown: {}, totalPaise: 100, payablePaise: 100, deliverySlot: 'standard', leadHours: 24, userId: u.id } });
    await acceptInvite(tokenOf(b.link), u.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).userId).toBe(u.id);
  });

  it('addVendor needs a phone, then creates an inactive bakery with an invite link', async () => {
    const name = `Added ${++serial}`;
    expect((await addVendor(undefined, form({ name, phone: '', email: '', address: '' }))).ok).toBe(false);
    const r = await addVendor(undefined, form({ name, phone: '9876543210', email: '', address: '' }));
    expect(r.ok).toBe(true);
    expect(r.link).toMatch(/\/join\//);
    const v = await db.vendor.findFirstOrThrow({ where: { name } });
    expect(v.isActive).toBe(false);
    const u = await user();
    expect(await acceptInvite(tokenOf(r.link!), u.id)).toEqual({ ok: true });
  });

  it('resendInvite returns a new link', async () => {
    const b = await bakery();
    const r = await resendInvite(undefined, form({ id: b.vendor.id }));
    expect(r.ok).toBe(true);
    expect(tokenOf(r.link!)).not.toBe(tokenOf(b.link));
  });

  it('approval and activation are refused until the bakery is ready for review, then work', async () => {
    const b = await bakery(); const u = await user();
    await acceptInvite(tokenOf(b.link), u.id);
    expect((await approveVendor(undefined, form({ id: b.vendor.id }))).ok).toBe(false);
    expect((await db.vendor.findUniqueOrThrow({ where: { id: b.vendor.id } })).isActive).toBe(false);

    const { setVendorActive } = await import('../app/admin/actions');
    expect((await setVendorActive(undefined, form({ id: b.vendor.id, isActive: 'true' }))).ok).toBe(false);

    const cake = await db.cakeProduct.create({ data: { slug: `inv-${++serial}`, name: 'Cake', description: 'c', category: 'chocolate', pricePaise: 100, sizeBand: '1kg' } });
    await db.vendorInventory.create({ data: { vendorId: b.vendor.id, productId: cake.id, productName: 'Cake', sizeBand: '1kg', eggType: 'eggless', isAvailable: true } });
    await db.vendor.update({ where: { id: b.vendor.id }, data: { locationSetAt: new Date(), detailsConfirmedAt: new Date() } });
    expect((await approveVendor(undefined, form({ id: b.vendor.id }))).ok).toBe(true);
    expect((await db.vendor.findUniqueOrThrow({ where: { id: b.vendor.id } })).isActive).toBe(true);
  });
});
