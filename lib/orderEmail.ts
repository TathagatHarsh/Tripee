import "server-only";
import type { Prisma } from "@prisma/client";
import { formatINR } from "./format";
import { outboxCreate } from "./notifications";
import { formatDue } from "./whatsappMessages";

/**
 * The one email a customer gets: "your order is confirmed", from orders@.
 *
 * Rendered when queued, not when sent, so the email describes the order as it
 * was confirmed. Delivery, retries and dedupe are the outbox's job
 * (lib/notifications.ts); this file only decides what to say and whether to say it.
 */

export interface ConfirmationFacts {
  ref: string;
  customerName: string | null;
  cakes: string[];
  totalPaise: number;
  pickup: boolean;
  dueAt: Date | null;
  slot: string | null;
  address: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function orderConfirmationEmail(f: ConfirmationFacts): RenderedEmail {
  const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/orders/${f.ref}`;
  const when = `${formatDue(f.dueAt)}${f.slot ? ` (${f.slot})` : ""}`;
  const rows: [string, string][] = [
    ["Order", f.ref],
    ["Cake", f.cakes.join(", ")],
    ["Total", formatINR(f.totalPaise)],
    [f.pickup ? "Pickup" : "Delivery", when],
    ...(f.address && !f.pickup ? [["Address", f.address] as [string, string]] : []),
  ];
  const greeting = `Hi ${f.customerName?.trim() || "there"},`;
  const intro = f.pickup
    ? "Your order is confirmed. We'll message you when it's ready to pick up from the bakery."
    : "Your order is confirmed and the bakery is on it.";

  const text = [greeting, "", intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Track your order: ${link}`, "", "Questions? Just reply to this email.", "MakeYourCakes"].join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:520px">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
<table style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>
<p><a href="${escapeHtml(link)}">Track your order</a> &middot; ${escapeHtml(link)}</p>
<p style="color:#666">Questions? Just reply to this email.<br>MakeYourCakes</p>
</div>`;

  return { subject: `Your MakeYourCakes order ${f.ref} is confirmed`, text, html };
}

/** Queue the confirmation email for an order, inside the transaction that confirmed it. */
export async function queueOrderConfirmationEmail(tx: Prisma.TransactionClient, orderId: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  const o = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      ref: true, customerName: true, customerEmail: true, cakeName: true, totalPaise: true, fulfillmentMethod: true,
      dueAt: true, requestedFor: true, deliverySlot: true,
      addressLine1: true, addressLine2: true, city: true, state: true, pincode: true,
      cakes: { orderBy: { position: "asc" }, select: { cakeName: true } },
    },
  });
  const to = o.customerEmail?.trim().toLowerCase();
  if (!to) return false;

  const pickup = o.fulfillmentMethod === "pickup";
  const cakes = o.cakes.map((c) => c.cakeName).filter((n): n is string => Boolean(n));
  const email = orderConfirmationEmail({
    ref: o.ref,
    customerName: o.customerName,
    cakes: cakes.length ? cakes : [o.cakeName ?? "Cake"],
    totalPaise: o.totalPaise,
    pickup,
    dueAt: o.dueAt ?? o.requestedFor,
    slot: o.deliverySlot,
    address: pickup ? null : [o.addressLine1, o.addressLine2, o.city, o.state, o.pincode].filter(Boolean).join(", ") || null,
  });

  const dedupeKey = `email:order:${orderId}:confirmed`;
  await tx.notificationOutbox.upsert({
    where: { dedupeKey },
    update: {},
    create: outboxCreate({ orderId, kind: "new_order", channel: "email", destination: to, payload: { ...email }, dedupeKey }),
  });
  return true;
}
