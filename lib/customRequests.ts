import "server-only";
import { Prisma, type CustomRequest, type Vendor } from "@prisma/client";
import { after } from "next/server";
import { ASSIGNMENT_TX, vendorBlockers } from "./assignment";
import { haversine, pointFrom } from "./assignmentRules";
import { refForAttempt, type PaymentProof } from "./checkout";
import { refundPayment } from "./checkoutPayment";
import { canMoveCustom, customerPricePaise, customOfferMinutes, MAX_BAKERIES, newCustomRef, newCustomToken, quoteExpiresAt, type CustomRequestInput } from "./customRules";
import { db } from "./db";
import { meetsDeadline } from "./inventoryRules";
import { log } from "./log";
import { IntentRecord } from "./razorpay";
import { optimize, store } from "./storage";
import { adminNumbers, indianMobile, normalizePhone } from "./whatsapp";
import { whatsappNewOrder } from "./whatsappEvents";
import { acceptedMessage, customOfferMessage, customQuoteMessage, queueWhatsApp, rupees, textMessage, updateMessage } from "./whatsappMessages";

type Tx = Prisma.TransactionClient;
type Message = Parameters<typeof queueWhatsApp>[1]["message"];

/** Nearest bakery that can take this request. Straight-line distance only: a quote is not a route promise. */
export async function nextBakery(tx: Prisma.TransactionClient, request: CustomRequest): Promise<{ vendor: Vendor; distanceKm: number } | null> {
  const dest = pointFrom(request.address);
  if (!dest) return null;
  const now = new Date();
  let best: { vendor: Vendor; distanceKm: number } | null = null;
  for (const vendor of await tx.vendor.findMany({ where: { id: { notIn: request.triedVendorIds } } })) {
    const origin = pointFrom(vendor);
    if (!origin || !normalizePhone(vendor.phone)) continue; // an offer nobody can read only burns the window
    const distanceKm = haversine(origin, dest);
    if (distanceKm > vendor.serviceRadiusKm || (best && distanceKm >= best.distanceKm)) continue;
    if ((await vendorBlockers(tx, vendor, now)).length) continue;
    if (!meetsDeadline(request.dueAt, vendor.preparationMinutes, (distanceKm / 20) * 60, now)) continue;
    best = { vendor, distanceKm };
  }
  return best;
}

/** Stores the photo and the request, then offers it to the nearest bakery after the response. */
export async function createCustomRequest(input: CustomRequestInput, photo: Buffer): Promise<{ ref: string }> {
  const phone = indianMobile(input.phone);
  if (!phone) throw new Error("Invalid phone number");
  for (let attempt = 0; ; attempt++) {
    const ref = newCustomRef();
    const photoUrl = await store(await optimize(photo), "custom", ref);
    try {
      const { id } = await db.customRequest.create({
        data: {
          ref, token: newCustomToken(), name: input.name, phone, photoUrl, sizeKg: input.sizeKg,
          budgetPaise: input.budgetRupees ? input.budgetRupees * 100 : null, flavour: input.flavour,
          cakeMessage: input.cakeMessage || null, dueAt: new Date(input.dueAt), address: input.address,
        },
        select: { id: true },
      });
      // A failure here is safe: runCustomRequestWorker offers requests that were never offered.
      after(() => offerNext(id).catch((error) => log("error", "custom_offer_failed", { id, error: String(error) })));
      return { ref };
    } catch (error) {
      // ref collision: try a fresh one
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") || attempt >= 4) throw error;
    }
  }
}

export const NOT_WAITING = "That request isn't waiting on you any more.";

async function locked(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "CustomRequest" WHERE id = ${id} FOR UPDATE`;
  return tx.customRequest.findUnique({ where: { id } });
}

const send = (tx: Tx, r: CustomRequest, to: (string | null | undefined)[], dedupeKey: string, message: Message, vendorId?: string | null) =>
  queueWhatsApp(tx, { customRequestId: r.id, vendorId, kind: "custom_request", to, dedupeKey, message });

const vendorPhone = async (tx: Tx, vendorId: string | null) =>
  vendorId ? (await tx.vendor.findUnique({ where: { id: vendorId }, select: { phone: true } }))?.phone : null;

/** Offers the request to the next-nearest bakery, or gives up after MAX_BAKERIES. A live offer is left alone. */
export async function offerNext(requestId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const r = await locked(tx, requestId);
    const now = new Date();
    if (!r || r.status !== "awaiting_quote" || (r.offerExpiresAt && r.offerExpiresAt > now)) return;
    if (r.vendorId) await send(tx, r, [await vendorPhone(tx, r.vendorId)], `cr:${r.id}:passed:${r.vendorId}`, updateMessage(r.ref, `${r.ref} has been passed on.`), r.vendorId);
    const next = r.triedVendorIds.length < MAX_BAKERIES ? await nextBakery(tx, r) : null;
    if (!next) {
      await tx.customRequest.update({ where: { id: r.id }, data: { status: "no_bakery", vendorId: null, offerExpiresAt: null } });
      await send(tx, r, adminNumbers(), `cr:${r.id}:nobakery`, updateMessage(r.ref, `No bakery could quote this custom cake. Customer: ${r.name} ${r.phone}`));
      return;
    }
    const { vendor } = next;
    await tx.customRequest.update({
      where: { id: r.id },
      data: { vendorId: vendor.id, triedVendorIds: { push: vendor.id }, offerExpiresAt: new Date(now.getTime() + customOfferMinutes() * 60_000) },
    });
    const address = r.address as { locality?: string; city?: string };
    await send(tx, r, [vendor.phone], `cr:${r.id}:offer:${vendor.id}`, customOfferMessage({
      id: r.id, ref: r.ref, photoUrl: r.photoUrl, sizeKg: r.sizeKg.toString(), flavour: r.flavour, cakeMessage: r.cakeMessage,
      dueAt: r.dueAt, area: address.locality ?? address.city ?? "", budgetPaise: r.budgetPaise,
    }), vendor.id);
  }, ASSIGNMENT_TX);
}

// Ends the current offer now; offerNext then moves on (the worker would too, if this process dies first).
const endOffer = (tx: Tx, id: string) => tx.customRequest.update({ where: { id }, data: { vendorId: null, offerExpiresAt: new Date() } });

export async function recordQuote(vendorId: string, requestId: string, vendorPaise: number): Promise<{ ok: true; quotePaise: number } | { ok: false; message: string }> {
  const res = await db.$transaction(async (tx): Promise<{ ok: true; quotePaise: number } | { ok: false; message: string; moveOn?: boolean }> => {
    const r = await locked(tx, requestId);
    const now = new Date();
    // The same quote applied again (a retried webhook) is already done.
    if (r?.status === "quoted" && r.vendorId === vendorId && r.vendorQuotePaise === vendorPaise) return { ok: true, quotePaise: r.quotePaise! };
    if (!r || r.status !== "awaiting_quote" || r.vendorId !== vendorId || !r.offerExpiresAt || r.offerExpiresAt <= now) return { ok: false, message: NOT_WAITING };
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { name: true, preparationMinutes: true } });
    const expiresAt = quoteExpiresAt(now, r.dueAt, vendor.preparationMinutes);
    if (expiresAt <= now) {
      await endOffer(tx, r.id);
      return { ok: false, message: `${r.ref} is due too soon for you to make it now, so it has been passed on.`, moveOn: true };
    }
    const margin = (await tx.bakerySettings.findUnique({ where: { id: "singleton" }, select: { customMarginPct: true } }))?.customMarginPct ?? 15;
    const quotePaise = customerPricePaise(vendorPaise, margin);
    await tx.customRequest.update({
      where: { id: r.id },
      data: { status: "quoted", vendorQuotePaise: vendorPaise, quotePaise, quoteExpiresAt: expiresAt, offerExpiresAt: null },
    });
    await send(tx, r, [r.phone], `cr:${r.id}:quote`, customQuoteMessage({ id: r.id, ref: r.ref, token: r.token, photoUrl: r.photoUrl, sizeKg: r.sizeKg.toString(), dueAt: r.dueAt, quotePaise }));
    await send(tx, r, adminNumbers(), `cr:${r.id}:quote:admin`, updateMessage(r.ref, `${vendor.name} quoted ₹${rupees(vendorPaise)}; customer price ₹${rupees(quotePaise)}`));
    return { ok: true, quotePaise };
  }, ASSIGNMENT_TX);
  if (res.ok) return res;
  if (res.moveOn) await offerNext(requestId);
  return { ok: false, message: res.message };
}

export async function declineOffer(vendorId: string, requestId: string): Promise<{ ok: boolean; message: string }> {
  const ref = await db.$transaction(async (tx) => {
    const r = await locked(tx, requestId);
    if (!r || r.status !== "awaiting_quote" || r.vendorId !== vendorId) return null;
    await endOffer(tx, r.id);
    return r.ref;
  }, ASSIGNMENT_TX);
  if (!ref) return { ok: false, message: NOT_WAITING };
  await offerNext(requestId);
  return { ok: true, message: `Okay, ${ref} has been passed on.` };
}

/** A customer's message about their own request. False when this number has nothing open (or just declined). */
export async function customerReply(phone: string, text: string | null, payload: string | null, msgId: string): Promise<boolean> {
  const declineId = /^cq_decline:(\S+)$/.exec(payload ?? "")?.[1];
  if (declineId) {
    const handled = await db.$transaction(async (tx) => {
      const r = await locked(tx, declineId);
      if (!r || r.phone !== phone) return false;
      if (r.status === "declined") return true; // a retried webhook
      if (!canMoveCustom(r.status, "declined")) return false;
      await tx.customRequest.update({ where: { id: r.id }, data: { status: "declined" } });
      await send(tx, r, [r.phone], `cr:${r.id}:declined`, textMessage("No problem — our team may message you."));
      await send(tx, r, adminNumbers(), `cr:${r.id}:declined:admin`, updateMessage(r.ref, `Customer passed on the ₹${rupees(r.quotePaise ?? 0)} quote. Customer: ${r.name} ${r.phone}`));
      await send(tx, r, [await vendorPhone(tx, r.vendorId)], `cr:${r.id}:declined:vendor`, updateMessage(r.ref, `The customer passed on ${r.ref}.`), r.vendorId);
      return true;
    }, ASSIGNMENT_TX);
    if (handled) return true;
  }
  const r = await db.customRequest.findFirst({ where: { phone, status: { in: ["awaiting_quote", "quoted"] } }, orderBy: { createdAt: "desc" } });
  if (!r) return false;
  await send(db, r, adminNumbers(), `cr:${r.id}:say:${msgId}`, updateMessage(r.ref, `Customer on ${r.ref} says: ${text ?? "(a message without text)"}`));
  return true;
}

export async function cancelCustomRequest(requestId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const r = await locked(tx, requestId);
    if (!r || !canMoveCustom(r.status, "cancelled")) return false;
    await tx.customRequest.update({ where: { id: r.id }, data: { status: "cancelled", offerExpiresAt: null } });
    if (r.vendorId)
      await send(tx, r, [await vendorPhone(tx, r.vendorId)], `cr:${r.id}:cancelled`, updateMessage(r.ref, `${r.ref} was cancelled. Please ignore it.`), r.vendorId);
    return true;
  }, ASSIGNMENT_TX);
}

export async function runCustomRequestWorker(): Promise<{ offers: number; quotes: number }> {
  const now = new Date();
  const due = await db.customRequest.findMany({
    // Expired offers, plus requests whose first offer never went out (a minute's grace so a new request isn't raced).
    where: { status: "awaiting_quote", OR: [{ offerExpiresAt: { lte: now } }, { offerExpiresAt: null, createdAt: { lte: new Date(now.getTime() - 60_000) } }] },
    select: { id: true }, take: 20, orderBy: { createdAt: "asc" },
  });
  let offers = 0;
  for (const { id } of due)
    try {
      await offerNext(id);
      offers++;
    } catch (error) {
      log("error", "custom_request_worker_failed", { id, error: error instanceof Error ? error.message : String(error) });
    }
  const { count: quotes } = await db.customRequest.updateMany({ where: { status: "quoted", quoteExpiresAt: { lte: now } }, data: { status: "expired" } });
  return { offers, quotes };
}

export type CustomPayment = { kind: "paid"; orderRef: string } | { kind: "refunded" | "refund_failed" | "already_paid" | "unmatched" };

/**
 * A verified payment for a quote becomes an ordinary order, already accepted by
 * the quoting bakery, or goes back to the customer. Call it only with a proof
 * whose signature was checked (or that Razorpay itself reported).
 *
 * Runs under the advisory lock openPaymentIntent and refundPayment take for
 * `custom:<id>`, so the client callback and the webhook cannot both make an
 * order, and a refund cannot clear the binding halfway through. The refund
 * itself happens after the commit, as refundPayment requires.
 *
 * `unmatched`: the payment is real but was not taken for this quote's Razorpay
 * order (or its binding was already cleared by a refund). It buys nothing and is
 * not refunded here, since it may belong to some other checkout.
 * `refund_failed`: the refund was asked for but not confirmed; the caller must retry or tell the customer.
 */
export async function payCustomRequest(requestId: string, proof: PaymentProof): Promise<CustomPayment> {
  const key = `custom:${requestId}`;
  const outcome = await db.$transaction(async (tx): Promise<CustomPayment | { kind: "refund" }> => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`checkout:${key}`}))`;
    const r = await locked(tx, requestId);
    const holder = await tx.order.findUnique({ where: { razorpayPaymentId: proof.razorpayPaymentId }, select: { id: true } });
    if (holder) return holder.id === r?.orderId ? { kind: "already_paid" } : { kind: "unmatched" };
    const intent = IntentRecord.safeParse((await tx.checkoutAttempt.findUnique({ where: { id: key } }))?.response);
    if (!intent.success || intent.data.razorpayOrderId !== proof.razorpayOrderId) return { kind: "unmatched" };
    if (!r || r.status !== "quoted" || intent.data.amountPaise !== r.quotePaise) return { kind: "refund" };
    if (!r.quoteExpiresAt || r.quoteExpiresAt <= new Date()) {
      await tx.customRequest.update({ where: { id: r.id }, data: { status: "expired" } });
      return { kind: "refund" };
    }
    const vendor = r.vendorId ? await tx.vendor.findUnique({ where: { id: r.vendorId } }) : null;
    if (!vendor?.isActive) {
      await tx.customRequest.update({ where: { id: r.id }, data: { status: "cancelled" } });
      await send(tx, r, adminNumbers(), `cr:${r.id}:paid:inactive`, updateMessage(r.ref, `Customer paid, but the quoting bakery is no longer active, so the payment is being refunded. Customer: ${r.name} ${r.phone}`));
      return { kind: "refund" };
    }

    const quotePaise = r.quotePaise!, vendorQuotePaise = r.vendorQuotePaise!;
    let ref: string | null = null;
    for (let attempt = 0; attempt < 8 && !ref; attempt++) {
      const candidate = await refForAttempt(key, 0, attempt);
      if (!(await tx.order.findUnique({ where: { ref: candidate }, select: { id: true } }))) ref = candidate;
    }
    if (!ref) throw new Error("No free order reference");
    const sizeKg = r.sizeKg.toNumber();
    const cakeName = `Custom cake · ${r.sizeKg.toString()} kg`;
    const address = r.address as { lat: number; lng: number; address: string; city: string; state: string; pincode: string };
    const now = new Date();
    const order = await tx.order.create({
      data: {
        ref, cakeName, cakeImageUrl: r.photoUrl,
        config: { custom: true, sizeKg, flavour: r.flavour, cakeMessage: r.cakeMessage, budgetPaise: r.budgetPaise },
        priceBreakdown: { custom: { vendorQuotePaise, quotePaise } },
        totalPaise: quotePaise, payablePaise: quotePaise, productSubtotalPaise: quotePaise,
        status: "confirmed", paymentStatus: "paid", confirmedAt: now,
        dueAt: r.dueAt, requestedFor: r.dueAt, deliverySlot: "custom",
        leadHours: Math.round((r.dueAt.getTime() - r.createdAt.getTime()) / 3600_000),
        customerName: r.name, customerPhone: r.phone,
        deliveryLocation: { latitude: address.lat, longitude: address.lng },
        addressLine1: address.address, city: address.city, state: address.state, pincode: address.pincode,
        customerNotes: r.cakeMessage,
        razorpayOrderId: proof.razorpayOrderId, razorpayPaymentId: proof.razorpayPaymentId,
        assignmentState: "ASSIGNED",
        items: { create: [{ label: cakeName, kind: "base", amountPaise: quotePaise, position: 0 }] },
      },
      select: { id: true, ref: true },
    });
    const assignment = await tx.vendorOrder.create({
      data: {
        orderId: order.id, vendorId: vendor.id, assignmentStatus: "ACCEPTED", status: "accepted", sequence: 0,
        offeredAt: now, assignedAt: now, acceptedAt: now, respondedAt: now,
        orderValuePaise: quotePaise, vendorEarningPaise: vendorQuotePaise, commissionPaise: quotePaise - vendorQuotePaise, feePaise: 0,
      },
      select: { id: true },
    });
    await tx.order.update({ where: { id: order.id }, data: { currentAssignmentId: assignment.id } });
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: "draft", toStatus: "confirmed" } });
    await tx.checkoutAttempt.updateMany({ where: { id: key }, data: { status: "completed", orderId: order.id } });
    await tx.customRequest.update({ where: { id: r.id }, data: { status: "paid", orderId: order.id } });

    await whatsappNewOrder(tx, order.id);
    // One message, not a text then the buttons: rows written in one transaction share createdAt, so the outbox could send them in either order.
    const accepted = acceptedMessage(order.ref, assignment.id);
    await queueWhatsApp(tx, {
      orderId: order.id, vendorId: vendor.id, kind: "vendor_assigned", to: [vendor.phone], dedupeKey: `wa:order:${order.id}:custom:paid`,
      message: { ...accepted, body: `✅ Customer paid — ${r.ref} is now order ${order.ref}. Tap each step as you go.` },
    });
    return { kind: "paid", orderRef: order.ref };
  }, ASSIGNMENT_TX);

  if (outcome.kind === "unmatched") log("warn", "custom_payment_unmatched", { requestId, paymentId: proof.razorpayPaymentId });
  if (outcome.kind !== "refund") return outcome;
  const { outcome: refund } = await refundPayment(proof);
  if (refund !== "failed") return { kind: "refunded" };
  log("error", "custom_payment_refund_failed", { requestId, paymentId: proof.razorpayPaymentId });
  return { kind: "refund_failed" };
}
