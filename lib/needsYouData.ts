import 'server-only';
import { cache } from 'react';
import { db } from '@/lib/db';
import { adminKitchen } from '@/lib/assignment';
import { classifyNeedsYou, glance, istDayStart, type NeedsYouOrder } from '@/lib/needsYou';
import { vendorSetupStates } from '@/lib/vendorInvite';

const OPEN = ['draft', 'confirmed', 'in_kitchen', 'out_for_delivery'] as const;

const ASSIGNMENT = { status: true, assignmentStatus: true, respondedAt: true, expiresAt: true, rejectionReason: true, vendor: { select: { name: true, phone: true } } } as const;

function title(cakeName: string | null, config: unknown) {
  const size = (config as { size?: unknown } | null)?.size;
  return `${cakeName || 'Cake'}${typeof size === 'string' && size ? ` · ${size}` : ''}`;
}

/** Cached per request so the layout badge and the home page share one load. */
export const loadNeedsYou = cache(async (now: Date = new Date()) => {
  const [open, todays, liveBakeries, activeBakeries, states, quotes, followUps] = await Promise.all([
    db.order.findMany({
      where: { status: { in: [...OPEN] } },
      select: {
        ref: true, status: true, dueAt: true, requestedFor: true, createdAt: true, cakeName: true, config: true, customerPhone: true,
        currentAssignment: { select: ASSIGNMENT },
        // finishOffer clears currentAssignmentId on reject/expiry, so read the latest ended offer too.
        assignments: { where: { assignmentStatus: { in: ['REJECTED', 'EXPIRED'] } }, orderBy: { assignedAt: 'desc' }, take: 1, select: ASSIGNMENT },
      },
    }),
    db.order.findMany({ where: { createdAt: { gte: istDayStart(now) } }, select: { status: true, totalPaise: true, createdAt: true } }),
    db.vendor.count({ where: { isActive: true, isAcceptingOrders: true } }),
    db.vendor.count({ where: { isActive: true } }),
    vendorSetupStates(),
    db.customRequest.findMany({ where: { status: 'awaiting_quote' }, select: { id: true, ref: true, flavour: true, createdAt: true } }),
    // Only what needs a human: abandoned checkouts sit `pending` forever, so they are not items.
    // /admin/payments (paymentFollowUps) still lists everything.
    Promise.all([
      db.refundOperation.findMany({ where: { status: { not: 'processed' }, lastError: { not: null } }, orderBy: { createdAt: 'asc' }, take: 100 }),
      db.paymentRecovery.findMany({ where: { status: { not: 'completed' }, OR: [{ status: 'refund_required' }, { lastError: { not: null } }] }, orderBy: { createdAt: 'asc' }, take: 100 }),
    ]).then(([refunds, recoveries]) => ({ refunds, recoveries })),
  ]);

  const reviewIds = [...states].filter(([, s]) => s.stage === 'ready_for_review').map(([id]) => id);
  const reviews = reviewIds.length ? await db.vendor.findMany({ where: { id: { in: reviewIds } }, select: { id: true, name: true, createdAt: true } }) : [];

  const orders: NeedsYouOrder[] = open.map((o) => {
    const a = o.currentAssignment ?? o.assignments[0];
    return {
      ref: o.ref, status: o.status, due: o.dueAt ?? o.requestedFor, createdAt: o.createdAt,
      title: `${o.ref} · ${title(o.cakeName, o.config)}`, paymentLabel: null, customerPhone: o.customerPhone,
      assignment: a && { vendorName: a.vendor.name, vendorPhone: a.vendor.phone, production: a.status, state: a.assignmentStatus, respondedAt: a.respondedAt, expiresAt: a.expiresAt, rejectionReason: a.rejectionReason },
    };
  });

  const result = classifyNeedsYou({
    orders, liveBakeries, adminKitchen: adminKitchen(),
    reviews: reviews.map((v) => ({ vendorId: v.id, name: v.name, createdAt: v.createdAt })),
    quotes: quotes.map((q) => ({ id: q.id, title: `${q.flavour} cake · ${q.ref}`, createdAt: q.createdAt })),
    followUps: [
      ...followUps.refunds.map((r) => ({ id: `refund:${r.paymentId}`, kind: 'refund' as const, label: `Refund for payment ${r.paymentId}`, createdAt: r.createdAt })),
      ...followUps.recoveries.map((r) => ({ id: `recovery:${r.id}`, kind: 'recovery' as const, label: `Payment check ${r.id}`, createdAt: r.createdAt })),
    ],
  }, now);

  return {
    result,
    glance: glance({
      todays, liveBakeries, activeBakeries,
      baking: open.filter((o) => o.status === 'in_kitchen').length,
      outForDelivery: open.filter((o) => o.status === 'out_for_delivery').length,
    }, now),
  };
});

export async function needsYouCount() {
  return (await loadNeedsYou()).result.total;
}
