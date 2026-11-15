import 'server-only';
import { db } from '@/lib/db';

const followUpCutoff = () => new Date(Date.now() - 15 * 60000);

/** Unsettled refunds and stale unfinished checkouts, oldest first (shared by the payments page and the admin home). */
export async function paymentFollowUps() {
  const [refunds, recoveries] = await Promise.all([
    db.refundOperation.findMany({ where: { status: { not: 'processed' } }, orderBy: { createdAt: 'asc' }, take: 100 }),
    db.paymentRecovery.findMany({ where: { status: { not: 'completed' }, createdAt: { lt: followUpCutoff() } }, orderBy: { createdAt: 'asc' }, take: 100 }),
  ]);
  return { refunds, recoveries };
}
