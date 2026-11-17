import "server-only";
import type { EggType, FulfillmentMethod, OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "./db";
import { whatsappHref } from "./customCakes";
import { telHref } from "./needsYou";
import { attemptLines, bakeryLine, callBakeryPhone, deliveryWindowLabel, type Attempt } from "./orderViews";

export type OrderPanelData = {
  ref: string;
  status: OrderStatus;
  createdAt: Date;
  paymentStatus: PaymentStatus;
  totalPaise: number;
  cakes: { name: string; size: string | null; eggType: EggType | null; message: string | null; photoUrl: string | null }[];
  fulfillmentMethod: FulfillmentMethod;
  deliverySlot: string;
  deliveryWindow: string;
  due: Date | null;
  deliveryLocation: unknown;
  customerName: string | null;
  customerPhone: string | null;
  attempts: Attempt[];
  bakeryLine: string;
  attemptLines: string[];
  callCustomerHref: string | null;
  whatsappHref: string | null;
  callBakeryHref: string | null;
};

/** Everything the orders quick-view needs for one order, in one query. Null when the ref is unknown. */
export async function loadOrderPanel(ref: string, now = new Date()): Promise<OrderPanelData | null> {
  const o = await db.order.findUnique({
    where: { ref },
    select: {
      ref: true, status: true, createdAt: true, paymentStatus: true, totalPaise: true, cancellationReason: true,
      fulfillmentMethod: true, deliverySlot: true, requestedWindow: true, dueAt: true, requestedFor: true, deliveryLocation: true,
      customerName: true, customerPhone: true, cakeName: true, config: true,
      cakes: { select: { cakeName: true, sizeBand: true, variantLabel: true, eggType: true, message: true, cakeImageUrl: true } },
      /* Ordered by when each offer was made: `sequence` restarts per assignment round, so it can tie. */
      assignments: {
        orderBy: { assignedAt: "asc" },
        select: {
          assignmentStatus: true, status: true, offeredAt: true, respondedAt: true, expiresAt: true, rejectionReason: true,
          vendor: { select: { name: true, phone: true } },
        },
      },
    },
  });
  if (!o) return null;

  const attempts: Attempt[] = o.assignments.map((a, i) => ({
    vendorName: a.vendor.name,
    vendorPhone: a.vendor.phone,
    state: a.assignmentStatus,
    production: a.status,
    sequence: i,
    offeredAt: a.offeredAt,
    respondedAt: a.respondedAt,
    expiresAt: a.expiresAt,
    rejectionReason: a.rejectionReason,
  }));

  const size = (o.config as { size?: string } | null)?.size ?? null;
  const cakes = o.cakes.length
    ? o.cakes.map((c) => ({ name: c.cakeName ?? o.cakeName ?? "Cake", size: c.sizeBand ?? c.variantLabel ?? null, eggType: c.eggType, message: c.message, photoUrl: c.cakeImageUrl }))
    : [{ name: o.cakeName ?? "Cake", size, eggType: null, message: null, photoUrl: null }];

  const firstName = o.customerName?.trim().split(/\s+/)[0];
  const greeting = `Hi${firstName ? ` ${firstName}` : ""}, this is MakeYourCakes about your order ${o.ref}.`;

  return {
    ref: o.ref,
    status: o.status,
    createdAt: o.createdAt,
    paymentStatus: o.paymentStatus,
    totalPaise: o.totalPaise,
    cakes,
    fulfillmentMethod: o.fulfillmentMethod,
    deliverySlot: o.deliverySlot,
    deliveryWindow: deliveryWindowLabel(o.requestedWindow, o.deliverySlot, o.dueAt ?? o.requestedFor),
    due: o.dueAt ?? o.requestedFor,
    deliveryLocation: o.deliveryLocation,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    attempts,
    bakeryLine: bakeryLine(o, attempts),
    attemptLines: attemptLines(attempts, now),
    callCustomerHref: telHref(o.customerPhone),
    whatsappHref: o.customerPhone ? whatsappHref(o.customerPhone, greeting) : null,
    callBakeryHref: telHref(callBakeryPhone(attempts)),
  };
}
