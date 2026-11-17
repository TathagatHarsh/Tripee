import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn(), vendor: vi.fn(), redirect: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { mocks.redirect(to); throw new Error(`redirect:${to}`); } }));
vi.mock('../lib/db', () => ({ hasDatabase: () => true, db: { userProfile: { findUnique: mocks.profile }, vendor: { findUnique: mocks.vendor } } }));
import { requireVendor, requireVendorSetup } from '../lib/auth';

describe('vendor guards and unapproved bakeries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk'; process.env.CLERK_SECRET_KEY = 'sk';
    mocks.auth.mockResolvedValue({ userId: 'u1' });
    mocks.profile.mockResolvedValue({ id: 'u1', role: 'VENDOR', vendorId: 'v1' });
  });
  it('requireVendorSetup lets an inactive bakery through', async () => {
    mocks.vendor.mockResolvedValue({ id: 'v1', isActive: false });
    expect((await requireVendorSetup()).vendor.id).toBe('v1');
  });
  it('requireVendor still refuses an inactive bakery', async () => {
    mocks.vendor.mockResolvedValue({ id: 'v1', isActive: false });
    await expect(requireVendor()).rejects.toThrow('redirect:/account?denied=vendor');
  });
  it('requireVendorSetup still refuses a missing bakery', async () => {
    mocks.vendor.mockResolvedValue(null);
    await expect(requireVendorSetup()).rejects.toThrow('redirect:/account?denied=vendor');
  });
});
