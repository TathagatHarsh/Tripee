import 'server-only';
import { db } from '@/lib/db';
import { siteUrl } from '@/lib/whatsapp';
import { hashInviteToken, newInviteToken, setupSteps, vendorStage, type SetupInput, type VendorStage } from '@/lib/onboarding';

/** Write a fresh token's hash and expiry, replacing any old hash, and return the link to hand over. */
export async function issueInvite(vendorId: string): Promise<{ link: string; expiresAt: Date }> {
  const { token, hash, expiresAt } = newInviteToken();
  await db.vendor.update({ where: { id: vendorId }, data: { inviteTokenHash: hash, inviteExpiresAt: expiresAt } });
  return { link: `${siteUrl()}/join/${token}`, expiresAt };
}

export type AcceptResult = { ok: true } | { ok: false; reason: 'expired' | 'staff' | 'other_bakery' };

/**
 * The one request path that sets a role (see lib/auth `loadProfile`). `userId`
 * must come from the server session, never a form. Everything, including
 * burning the token, is one transaction so a token cannot be spent twice.
 */
export async function acceptInvite(token: string, userId: string): Promise<AcceptResult> {
  const hash = hashInviteToken(token);
  return db.$transaction(async (tx): Promise<AcceptResult> => {
    const now = new Date();
    const vendor = await tx.vendor.findFirst({
      where: { inviteTokenHash: hash, inviteExpiresAt: { gt: now } },
      select: { id: true },
    });
    if (!vendor) return { ok: false, reason: 'expired' };

    const profile = await tx.userProfile.findUnique({ where: { id: userId }, select: { role: true, vendorId: true } });
    if (!profile) return { ok: false, reason: 'expired' };
    if (profile.role === 'ADMIN' || profile.role === 'KITCHEN') return { ok: false, reason: 'staff' };
    if (profile.role === 'VENDOR') {
      return profile.vendorId === vendor.id ? { ok: true } : { ok: false, reason: 'other_bakery' };
    }
    // Claim the token before writing the role: under READ COMMITTED two accepts can both pass the
    // lookup above, but only one updateMany sees the hash still set (the other waits on the row lock, then matches 0).
    const claimed = await tx.vendor.updateMany({
      where: { id: vendor.id, inviteTokenHash: hash, inviteExpiresAt: { gt: now } },
      data: { inviteTokenHash: null, inviteExpiresAt: null },
    });
    if (claimed.count !== 1) return { ok: false, reason: 'expired' };
    await tx.userProfile.update({ where: { id: userId }, data: { role: 'VENDOR', vendorId: vendor.id } });
    return { ok: true };
  });
}

export async function invitedBakery(token: string): Promise<{ name: string } | null> {
  return db.vendor.findFirst({
    where: { inviteTokenHash: hashInviteToken(token), inviteExpiresAt: { gt: new Date() } },
    select: { name: true },
  });
}

/** Stage inputs for the given bakeries (all when omitted): linked logins and available variants are counted, not stored. */
export async function vendorSetupStates(ids?: string[]) {
  const where = ids ? { id: { in: ids } } : {};
  const [vendors, users, variants] = await Promise.all([
    db.vendor.findMany({ where, select: { id: true, isActive: true, isAcceptingOrders: true, locationSetAt: true, detailsConfirmedAt: true, inviteExpiresAt: true } }),
    db.userProfile.groupBy({ by: ['vendorId'], where: { vendorId: ids ? { in: ids } : { not: null } }, _count: { _all: true } }),
    db.vendorInventory.groupBy({ by: ['vendorId'], where: { isAvailable: true, ...(ids ? { vendorId: { in: ids } } : {}) }, _count: { _all: true } }),
  ]);
  const u = new Map(users.map((r) => [r.vendorId, r._count._all]));
  const a = new Map(variants.map((r) => [r.vendorId, r._count._all]));
  const now = new Date();
  return new Map(vendors.map((v) => {
    const input: SetupInput = { ...v, linkedUsers: u.get(v.id) ?? 0, availableVariants: a.get(v.id) ?? 0 };
    return [v.id, { stage: vendorStage(input, now) as VendorStage, steps: setupSteps(input) }] as const;
  }));
}

export const STAGE_LABEL: Record<VendorStage, string> = {
  invited: 'Invited',
  invite_expired: 'Invite expired',
  setting_up: 'Setting up',
  ready_for_review: 'Ready for review',
  live: 'Live',
  paused: 'Paused',
};

export const stageLabel = (s: { stage: VendorStage; steps: { done: number } }) =>
  s.stage === 'setting_up' ? `${STAGE_LABEL.setting_up} ${s.steps.done}/4` : STAGE_LABEL[s.stage];

export const STAGE_TONE: Record<VendorStage, 'plain' | 'good' | 'warn' | 'bad'> = {
  invited: 'plain', invite_expired: 'bad', setting_up: 'warn', ready_for_review: 'good', live: 'good', paused: 'warn',
};
