import { createHash, randomBytes } from 'node:crypto';
import { whatsappHref } from '@/lib/customCakes';

export type SetupInput = {
  isActive: boolean;
  isAcceptingOrders: boolean;
  locationSetAt: Date | null;
  detailsConfirmedAt: Date | null;
  inviteExpiresAt: Date | null;
  linkedUsers: number;
  availableVariants: number;
};

export function setupSteps(v: SetupInput) {
  const s = {
    account: v.linkedUsers > 0,
    location: v.locationSetAt != null,
    cakes: v.availableVariants > 0,
    details: v.detailsConfirmedAt != null,
  };
  return { ...s, done: Object.values(s).filter(Boolean).length };
}

export type VendorStage = 'invited' | 'invite_expired' | 'setting_up' | 'ready_for_review' | 'live' | 'paused';

export function vendorStage(v: SetupInput, now: Date): VendorStage {
  if (v.isActive) return v.isAcceptingOrders ? 'live' : 'paused';
  if (v.linkedUsers === 0) return v.inviteExpiresAt && v.inviteExpiresAt > now ? 'invited' : 'invite_expired';
  return setupSteps(v).done < 4 ? 'setting_up' : 'ready_for_review';
}

export type PauseLength = 'today' | 'tomorrow' | { date: string };

// IST is a fixed UTC+5:30 (no DST), so plain offset arithmetic is exact.
const IST_MS = 330 * 60_000;

export function pauseEnd(length: PauseLength, now: Date): Date {
  const ist = new Date(now.getTime() + IST_MS);
  const [y, m, d] = [ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()];
  if (length === 'tomorrow') return new Date(Date.UTC(y, m, d + 1, 7) - IST_MS);
  if (length === 'today') return new Date(Date.UTC(y, m, d, 23, 59, 59) - IST_MS);
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(length.date);
  if (!p) throw new RangeError('Invalid pause date');
  const [py, pm, pd] = [Number(p[1]), Number(p[2]) - 1, Number(p[3])];
  const end = new Date(Date.UTC(py, pm, pd, 23, 59, 59) - IST_MS);
  // Date.UTC rolls 31 Feb into March; reject that.
  if (new Date(Date.UTC(py, pm, pd)).getUTCDate() !== pd) throw new RangeError('Invalid pause date');
  if (end <= now) throw new RangeError('Pause date is in the past');
  return end;
}

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function newInviteToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token), expiresAt: new Date(Date.now() + 7 * 864e5) };
}

export const whatsappInviteUrl = (phone: string, bakery: string, link: string) =>
  whatsappHref(phone, `Hi! ${bakery} has been invited to MakeYourCakes. Set up your bakery here: ${link}`);
