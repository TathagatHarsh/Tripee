import "server-only";
import { Prisma, type CustomRequest } from "@prisma/client";
import { after } from "next/server";
import { ASSIGNMENT_TX } from "./assignment";
import { refForAttempt, type PaymentProof } from "./checkout";
import { refundPayment } from "./checkoutPayment";
import { refundOperationStatus } from "./refunds";
import { canMoveCustom, newCustomRef, newCustomToken, parseQuoteReply, QUOTE_MAX_PAISE, QUOTE_MIN_PAISE, quoteExpiresAt, type NewCustomRequest } from "./customRules";
import { readDeliverySettings } from "./catalogData";
import { db } from "./db";
import { DEFAULT_DELIVERY_RULES, windowEndingAt, type DeliveryRules } from "./deliveryRules";
import { log } from "./log";
import { dispatchPendingNotifications } from "./notifications";
import { IntentRecord } from "./razorpay";
import { optimize, store } from "./storage";
import { adminNumbers, indianMobile, siteUrl } from "./whatsapp";
import { whatsappNewOrder } from "./whatsappEvents";
import { customOfferMessage, customQuoteMessage, queueWhatsApp, rupees, textMessage, updateMessage } from "./whatsappMessages";

/*
 * Custom cakes are MakeYourCakes' own: the admin prices them and bakes them.
 * A request goes to the admin numbers (WHATSAPP_ADMIN_NUMBERS), never to a
 * partner bakery. The admin replies to that WhatsApp message with the price the
 * customer pays in all (delivery included), or quotes on /admin/custom-requests.
 * The customer pays MakeYourCakes; the paid order is made in-house.
 */

type Tx = Prisma.TransactionClient;
type Message = Parameters<typeof queueWhatsApp>[1]["message"];

async function locked(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "CustomRequest" WHERE id = ${id} FOR UPDATE`;
  return tx.customRequest.findUnique({ where: { id } });
}

const send = (tx: Tx, r: CustomRequest, to: (string | null | undefined)[], dedupeKey: string, message: Message) =>
  queueWhatsApp(tx, { customRequestId: r.id, kind: "custom_request", to, dedupeKey, message });

const sendNow = () => after(() => dispatchPendingNotifications(10).catch((error) => log("error", "notification_dispatch_failed", { error: String(error) })));

/** The request, with its photo, to every admin number: replying to it with a price quotes it. */
function askAdmins(tx: Tx, r: CustomRequest) {
  const address = r.address as { locality?: string; city?: string };
  return send(tx, r, adminNumbers(), `cr:${r.id}:ask`, customOfferMessage({
    id: r.id, ref: r.ref, sizeKg: r.sizeKg.toString(), flavour: r.flavour, cakeMessage: r.cakeMessage,
    dueAt: r.dueAt, area: address.locality || address.city || "", budgetPaise: r.budgetPaise,
  }));
}

/** Stores the photo and the request, and sends it to the admin numbers at once. */
export async function createCustomRequest(input: NewCustomRequest, photo: Buffer): Promise<{ ref: string }> {
  const phone = indianMobile(input.phone);
  if (!phone) throw new Error("Invalid phone number");
  for (let attempt = 0; ; attempt++) {
    const ref = newCustomRef();
    const photoUrl = await store(await optimize(photo), "custom", ref);
    try {
      await db.$transaction(async (tx) => {
        const r = await tx.customRequest.create({
          data: {
            ref, token: newCustomToken(), name: input.name, phone, photoUrl, sizeKg: input.sizeKg,
            budgetPaise: input.budgetRupees ? input.budgetRupees * 100 : null, flavour: input.flavour,
            cakeMessage: input.cakeMessage || null, dueAt: new Date(input.dueAt), address: input.address,
          },
        });
        await askAdmins(tx, r);
      });
      sendNow();
      return { ref };
    } catch (error) {
      // ref collision: try a fresh one
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") || attempt >= 4) throw error;
    }
  }
}

type QuoteResult = { ok: true; quotePaise: number } | { ok: false; message: string };

/**
 * Prices a locked, open request at what the customer pays in all, delivery included, and sends
 * them the quote. `tell` are the admin numbers to update (the one who replied on WhatsApp is
 * answered directly instead).
 */
async function quote(tx: Tx, r: CustomRequest, totalPaise: number, rules: DeliveryRules, tell: string[]): Promise<QuoteResult> {
  const min = QUOTE_MIN_PAISE + rules.feePaise;
  if (!Number.isInteger(totalPaise) || totalPaise < min || totalPaise > QUOTE_MAX_PAISE)
    return { ok: false, message: `Enter what the customer pays, between ₹${rupees(min)} and ₹${rupees(QUOTE_MAX_PAISE)}.` };
  const now = new Date();
  const expiresAt = quoteExpiresAt(now, r.dueAt, rules.customMinMinutes);
  if (expiresAt <= now) return { ok: false, message: `${r.ref} is due too soon to make it now.` };
  await tx.customRequest.update({
    where: { id: r.id },
    data: { status: "quoted", quotePaise: totalPaise, quoteExpiresAt: expiresAt, vendorId: null, vendorQuotePaise: null, offerExpiresAt: null },
  });
  const chosen = windowEndingAt(r.dueAt, rules);
  await send(tx, r, [r.phone], `cr:${r.id}:quote`, customQuoteMessage({ id: r.id, ref: r.ref, token: r.token, sizeKg: r.sizeKg.toString(), dueAt: r.dueAt, requestedFor: chosen?.start, requestedWindow: chosen?.label, quotePaise: totalPaise }));
  await send(tx, r, tell, `cr:${r.id}:quote:admin`, updateMessage(r.ref, `₹${rupees(totalPaise)} quote sent to ${r.name}. We'll tell you when they pay`));
  return { ok: true, quotePaise: totalPaise };
}

/** The admin prices a request that is waiting for a quote (or that no bakery took, from before). */
export async function adminQuote(requestId: string, totalPaise: number, tell: string[] = adminNumbers()): Promise<QuoteResult> {
  const rules = (await readDeliverySettings()) ?? DEFAULT_DELIVERY_RULES;
  const res = await db.$transaction(async (tx): Promise<QuoteResult> => {
    const r = await locked(tx, requestId);
    if (!r || !canMoveCustom(r.status, "quoted")) return { ok: false, message: "That request is no longer open for a quote." };
    return quote(tx, r, totalPaise, rules, tell);
  }, ASSIGNMENT_TX);
  if (res.ok) sendNow();
  return res;
}

/** Thrown to roll back a phone request whose quote was refused; carries the reason. */
class Refused extends Error {}

/**
 * A request taken over the phone: saved and quoted in one transaction, so it is never left
 * half-made. With no photo, the request shows our logo.
 */
export async function createAdminQuote(input: NewCustomRequest, photo: Buffer | null, totalPaise: number): Promise<QuoteResult & { ref?: string }> {
  const phone = indianMobile(input.phone);
  if (!phone) return { ok: false, message: "Enter a 10-digit mobile number." };
  const ref = newCustomRef(); // ponytail: no retry on a ref collision (1 in 10^9); the admin just presses Send again
  const photoUrl = photo ? await store(await optimize(photo), "custom", ref) : `${siteUrl()}/brand/logo-original.png`;
  const rules = (await readDeliverySettings()) ?? DEFAULT_DELIVERY_RULES;
  try {
    const res = await db.$transaction(async (tx) => {
      const r = await tx.customRequest.create({
        data: {
          ref, token: newCustomToken(), name: input.name, phone, photoUrl, sizeKg: input.sizeKg,
          budgetPaise: input.budgetRupees ? input.budgetRupees * 100 : null, flavour: input.flavour,
          cakeMessage: input.cakeMessage || null, dueAt: new Date(input.dueAt), address: input.address,
        },
      });
      const q = await quote(tx, r, totalPaise, rules, adminNumbers());
      if (!q.ok) throw new Refused(q.message);
      return { ...q, ref };
    }, ASSIGNMENT_TX);
    sendNow();
    return res;
  } catch (error) {
    if (error instanceof Refused) return { ok: false, message: error.message };
    throw error;
  }
}

/**
 * An admin's WhatsApp message about a custom request: a price sent as a reply to the request's
 * message (or with its CR- ref, or when only one is waiting), or "Can't do it" on it.
 * Undefined when the message is not about one; otherwise what to answer (null: nothing).
 */
export async function adminReply(from: string, msg: { text?: string | null; payload?: string | null; contextId?: string | null }): Promise<string | null | undefined> {
  const declineId = /^cq_no:(\S+)$/.exec(msg.payload ?? "")?.[1];
  if (declineId) {
    const r = await db.customRequest.findUnique({ where: { id: declineId }, select: { ref: true } });
    return r && (await cancelCustomRequest(declineId)) ? `${r.ref} is cancelled and the customer has been told.` : "That request is already closed.";
  }
  const price = parseQuoteReply(msg.text ?? "");
  if (!price) return undefined;
  if (price.kind === "out_of_range") return "Send what the customer pays in rupees, e.g. 1800.";
  // Which request: the one whose message this replies to, else the typed ref, else the only one waiting.
  const quoted = msg.contextId
    ? await db.notificationOutbox.findFirst({ where: { providerMessageId: msg.contextId, customRequestId: { not: null } }, select: { customRequestId: true } })
    : null;
  let target = quoted?.customRequestId ? await db.customRequest.findUnique({ where: { id: quoted.customRequestId }, select: { id: true, ref: true } })
    : price.ref ? await db.customRequest.findUnique({ where: { ref: price.ref }, select: { id: true, ref: true } })
    : null;
  if (!target && !price.ref) {
    const open = await db.customRequest.findMany({ where: { status: { in: ["awaiting_quote", "no_bakery"] } }, select: { id: true, ref: true }, orderBy: { createdAt: "asc" }, take: 6 });
    if (open.length > 1) return `Which request? Reply to its message with the price, or send *${rupees(price.paise)} ${open[0].ref}*. Waiting: ${open.map((r) => r.ref).join(", ")}`;
    target = open[0] ?? null;
  }
  if (!target) return "No custom request is waiting for a price. Reply to the request's message with the price.";
  const res = await adminQuote(target.id, price.paise, adminNumbers().filter((n) => n !== from));
  return res.ok ? `✅ ${target.ref}: quote of ₹${rupees(price.paise)} sent to the customer. We'll tell you when they pay.` : `${target.ref}: ${res.message}`;
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
    await send(tx, r, [r.phone], `cr:${r.id}:cancelled:customer`, updateMessage(r.ref, "your custom cake request has been cancelled"));
    return true;
  }, ASSIGNMENT_TX);
}

/** Quotes the customer didn't pay in time expire. (Requests are priced by the admin, so nothing else is chased.) */
export async function runCustomRequestWorker(): Promise<{ quotes: number }> {
  const { count: quotes } = await db.customRequest.updateMany({ where: { status: "quoted", quoteExpiresAt: { lte: new Date() } }, data: { status: "expired" } });
  return { quotes };
}

export type CustomPayment = { kind: "paid"; orderRef: string } | { kind: "refunded" | "refund_failed" | "already_paid" | "unmatched" };

/**
 * A verified payment for a quote becomes an ordinary paid order that
 * MakeYourCakes makes itself (no partner bakery), or goes back to the customer. Call it only with a proof
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
 * `refunded` includes a refund Razorpay has not finished but that is durably recorded and retried.
 * `refund_failed`: no retried refund is on record (none was recorded, or Razorpay failed it); the caller must retry or tell the customer.
 */
export async function payCustomRequest(requestId: string, proof: PaymentProof): Promise<CustomPayment> {
  const key = `custom:${requestId}`;
  // Read before the transaction: a second connection inside it can starve the pool.
  const rules = (await readDeliverySettings()) ?? DEFAULT_DELIVERY_RULES;
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

    // The quote is "delivery included": today's delivery fee is that part, the cake the rest.
    const quotePaise = r.quotePaise!;
    const deliveryFeePaise = Math.min(rules.feePaise, quotePaise), cakePaise = quotePaise - deliveryFeePaise;
    // The request keeps only the window's end; rebuild the window the customer chose.
    const chosen = windowEndingAt(r.dueAt, rules);
    let ref: string | null = null;
    for (let attempt = 0; attempt < 8 && !ref; attempt++) {
      const candidate = await refForAttempt(key, 0, attempt);
      if (!(await tx.order.findUnique({ where: { ref: candidate }, select: { id: true } }))) ref = candidate;
    }
    if (!ref) throw new Error("No free order reference");
    const sizeKg = r.sizeKg.toNumber();
    const cakeName = `Custom cake · ${r.sizeKg.toString()} kg · ${r.flavour}`; // the flavour must survive: Order.config reads back null
    const address = r.address as { lat: number; lng: number; address: string; city: string; state: string; pincode: string };
    const now = new Date();
    const order = await tx.order.create({
      data: {
        ref, cakeName, cakeImageUrl: r.photoUrl,
        config: { custom: true, sizeKg, flavour: r.flavour, cakeMessage: r.cakeMessage, budgetPaise: r.budgetPaise },
        priceBreakdown: { custom: { quotePaise, deliveryFeePaise } },
        totalPaise: quotePaise, payablePaise: quotePaise, productSubtotalPaise: cakePaise, deliveryFeePaise,
        status: "confirmed", paymentStatus: "paid", confirmedAt: now,
        dueAt: r.dueAt, requestedFor: chosen?.start ?? r.dueAt, requestedWindow: chosen?.label ?? null, deliverySlot: "custom",
        leadHours: Math.round((r.dueAt.getTime() - r.createdAt.getTime()) / 3600_000),
        customerName: r.name, customerPhone: r.phone,
        deliveryLocation: { latitude: address.lat, longitude: address.lng },
        addressLine1: address.address, city: address.city, state: address.state, pincode: address.pincode,
        customerNotes: r.cakeMessage,
        razorpayOrderId: proof.razorpayOrderId, razorpayPaymentId: proof.razorpayPaymentId,
        // Made in-house: MANUAL keeps it out of bakery auto-assignment ("our main bakery is arranging your cake").
        assignmentState: "MANUAL", assignmentNote: "Custom cake: made by MakeYourCakes",
        items: { create: [{ label: cakeName, kind: "base", amountPaise: cakePaise, position: 0 }] },
      },
      select: { id: true, ref: true },
    });
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: "draft", toStatus: "confirmed" } });
    await tx.checkoutAttempt.updateMany({ where: { id: key }, data: { status: "completed", orderId: order.id } });
    await tx.customRequest.update({ where: { id: r.id }, data: { status: "paid", orderId: order.id } });

    // The admin numbers hear about it like any new order; there is no bakery to tell.
    await whatsappNewOrder(tx, order.id);
    return { kind: "paid", orderRef: order.ref };
  }, ASSIGNMENT_TX);

  if (outcome.kind === "unmatched") log("warn", "custom_payment_unmatched", { requestId, paymentId: proof.razorpayPaymentId });
  if (outcome.kind !== "refund") return outcome;
  const { outcome: refund } = await refundPayment(proof);
  if (refund !== "failed") return { kind: "refunded" };
  // Recorded and not failed by Razorpay (e.g. its refund is `pending`): reconcileRefunds finishes it, so it is on its way.
  const recorded = await refundOperationStatus(proof.razorpayPaymentId).catch(() => null);
  if (recorded && recorded !== "failed") return { kind: "refunded" };
  log("error", "custom_payment_refund_failed", { requestId, paymentId: proof.razorpayPaymentId });
  return { kind: "refund_failed" };
}
