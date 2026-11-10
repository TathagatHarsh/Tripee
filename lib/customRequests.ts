import "server-only";
import type { CustomRequest, Prisma, Vendor } from "@prisma/client";
import { ASSIGNMENT_TX, vendorBlockers } from "./assignment";
import { haversine, pointFrom } from "./assignmentRules";
import { canMoveCustom, customerPricePaise, customOfferMinutes, MAX_BAKERIES, quoteExpiresAt } from "./customRules";
import { db } from "./db";
import { meetsDeadline } from "./inventoryRules";
import { log } from "./log";
import { adminNumbers, normalizePhone } from "./whatsapp";
import { customOfferMessage, customQuoteMessage, queueWhatsApp, rupees, textMessage, updateMessage } from "./whatsappMessages";

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
    if (r.status === "awaiting_quote" && r.vendorId)
      await send(tx, r, [await vendorPhone(tx, r.vendorId)], `cr:${r.id}:cancelled`, updateMessage(r.ref, `${r.ref} has been cancelled. Please ignore it.`), r.vendorId);
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
