import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { hashInviteToken, newInviteToken, pauseEnd, setupSteps, vendorStage, whatsappInviteUrl } = await import('../lib/onboarding');

const now = new Date('2026-11-15T10:00:00Z');
const base = { isActive: false, isAcceptingOrders: true, locationSetAt: null, detailsConfirmedAt: null, inviteExpiresAt: null, linkedUsers: 0, availableVariants: 0 };
const ready = { ...base, linkedUsers: 1, locationSetAt: now, detailsConfirmedAt: now, availableVariants: 3 };

describe('vendorStage', () => {
  it('is invited until the invite expires', () => {
    expect(vendorStage({ ...base, inviteExpiresAt: new Date('2026-11-20T00:00:00Z') }, now)).toBe('invited');
  });
  it('is invite_expired when the invite lapsed or never existed', () => {
    expect(vendorStage({ ...base, inviteExpiresAt: new Date('2026-11-10T00:00:00Z') }, now)).toBe('invite_expired');
    expect(vendorStage(base, now)).toBe('invite_expired');
  });
  it('is setting_up when linked with 2 of 4 steps done', () => {
    const v = { ...base, linkedUsers: 1, locationSetAt: now };
    expect(setupSteps(v).done).toBe(2);
    expect(vendorStage(v, now)).toBe('setting_up');
  });
  it('is ready_for_review when all steps are done but inactive', () => {
    expect(setupSteps(ready).done).toBe(4);
    expect(vendorStage(ready, now)).toBe('ready_for_review');
  });
  it('is live or paused when active', () => {
    expect(vendorStage({ ...ready, isActive: true }, now)).toBe('live');
    expect(vendorStage({ ...ready, isActive: true, isAcceptingOrders: false }, now)).toBe('paused');
  });
  it('treats an active bakery with 0 cakes as live', () => {
    expect(vendorStage({ ...base, isActive: true }, now)).toBe('live');
  });
});

describe('pauseEnd', () => {
  it('rest of today ends 23:59:59 IST', () => {
    expect(pauseEnd('today', new Date('2026-11-15T19:00:00Z')).toISOString()).toBe('2026-11-16T18:29:59.000Z');
    expect(pauseEnd('today', now).toISOString()).toBe('2026-11-15T18:29:59.000Z');
  });
  it('until tomorrow is 07:00 IST next day', () => {
    expect(pauseEnd('tomorrow', now).toISOString()).toBe('2026-11-16T01:30:00.000Z');
  });
  it('a picked date ends 23:59:59 IST that day', () => {
    expect(pauseEnd({ date: '2026-11-20' }, now).toISOString()).toBe('2026-11-20T18:29:59.000Z');
  });
  it('rejects past and malformed dates', () => {
    expect(() => pauseEnd({ date: '2026-11-01' }, now)).toThrow(RangeError);
    expect(() => pauseEnd({ date: 'tomorrow' }, now)).toThrow(RangeError);
    expect(() => pauseEnd({ date: '2026-02-31' }, now)).toThrow(RangeError);
  });
});

describe('invite token', () => {
  it('hashes to the stored hash and expires in 7 days', () => {
    const t = newInviteToken();
    expect(hashInviteToken(t.token)).toBe(t.hash);
    expect(Math.abs(t.expiresAt.getTime() - (Date.now() + 7 * 864e5))).toBeLessThan(1000);
  });
});

describe('whatsappInviteUrl', () => {
  it('builds a wa.me link carrying the invite link', () => {
    const url = whatsappInviteUrl('98765 43210', 'Sweet Spot', 'https://x.test/join/abc')!;
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hi! Sweet Spot has been invited to MakeYourCakes. Set up your bakery here: https://x.test/join/abc');
  });
  it('is null for an invalid phone', () => {
    expect(whatsappInviteUrl('123', 'Sweet Spot', 'https://x.test/j')).toBeNull();
  });
});
