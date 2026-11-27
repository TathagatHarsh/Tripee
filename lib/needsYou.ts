import type { AssignmentStatus, OrderStatus, VendorOrderStatus } from "@prisma/client";
import { dueUrgency } from "@/lib/vendors";

// Pure: no db, no clock. Everything time-based uses the `now` argument.

export type NeedsYouFilter = "all" | "late" | "stuck" | "new" | "requests";
type Category = Exclude<NeedsYouFilter, "all">;

export type NeedsYouOrder = {
  ref: string;
  status: OrderStatus;
  due: Date | null;
  createdAt: Date;
  title: string;
  paymentLabel: string | null;
  customerPhone: string | null;
  assignment: null | {
    vendorName: string;
    vendorPhone: string | null;
    production: VendorOrderStatus;
    state: AssignmentStatus;
    respondedAt: Date | null;
    expiresAt: Date | null;
    rejectionReason: string | null;
  };
};

export type NeedsYouInput = {
  orders: NeedsYouOrder[];
  liveBakeries: number;
  /** ADMIN_KITCHEN: the admin makes every order, so an unheld order is a to-do, not a missing bakery. */
  adminKitchen?: boolean;
  reviews: { vendorId: string; name: string; createdAt: Date }[];
  quotes: { id: string; title: string; createdAt: Date }[];
  followUps: { id: string; kind: "refund" | "recovery"; label: string; createdAt: Date }[];
};

export type NeedsYouAction =
  | { kind: "link"; href: string; label: string }
  | { kind: "confirm"; ref: string; label: "Confirm" };

export type NeedsYouItem = {
  key: string;
  category: Category;
  tag: string;
  title: string;
  detail: string;
  href?: string;
  action: NeedsYouAction;
  secondary?: NeedsYouAction;
  sortAt: Date;
};

const CATEGORIES: Category[] = ["late", "stuck", "new", "requests"];
const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const IST_OFFSET_MS = 5.5 * HOUR_MS;
const DAY_MS = 24 * HOUR_MS;

const mins = (ms: number) => Math.floor(ms / MIN_MS);

/** A dialable link in +country form; a bare 10-digit number is Indian. Null when it is not a phone. */
export function telHref(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10) d = `91${d}`;
  if (d.length === 11 && d.startsWith("0")) d = `91${d.slice(1)}`;
  return d.length >= 11 && d.length <= 15 ? `tel:+${d}` : null;
}

const openOrder = (ref: string): NeedsYouAction => ({
  kind: "link",
  href: `/admin/orders/${ref}`,
  label: "Open order",
});

// Assignment is automatic, so a stuck or unheld order opens the orders workspace on it rather than offering to assign.
const openInPanel = (ref: string): NeedsYouAction => ({
  kind: "link",
  href: `/admin/orders?view=needs&open=${encodeURIComponent(ref)}`,
  label: "Open order",
});

// A rejected, expired or cancelled assignment no longer holds the order.
const HELD: AssignmentStatus[] = ["PENDING", "OFFERED", "ACCEPTED"];

function lateItem(o: NeedsYouOrder, now: Date, adminKitchen = false): NeedsYouItem | null {
  if (!o.due) return null;
  if (o.status !== "confirmed" && o.status !== "in_kitchen" && o.status !== "out_for_delivery") return null;
  const urgency = dueUrgency(o.due, now);
  if (urgency !== "late" && urgency !== "urgent") return null;
  // Out for delivery only counts once it is actually late.
  if (o.status === "out_for_delivery" && urgency !== "late") return null;

  const left = o.due.getTime() - now.getTime();
  const tag =
    urgency === "late"
      ? `Late · ${mins(-left)} min`
      : left >= HOUR_MS
        ? `Due in ${Math.floor(left / HOUR_MS)} h`
        : `Due in ${mins(left)} min`;

  const a = o.assignment && HELD.includes(o.assignment.state) ? o.assignment : null;
  let detail = "No bakery yet";
  let action: NeedsYouAction = openInPanel(o.ref);
  // Nobody holds it but it is already in progress (e.g. the owner is baking it): assigning makes no sense.
  if (!a && o.status !== "confirmed") {
    detail = o.status === "out_for_delivery" ? "Out for delivery" : "Baking";
    action = openOrder(o.ref);
  } else if (!a && adminKitchen) {
    detail = "Not started";
    action = openOrder(o.ref);
  }
  if (a) {
    const stage =
      o.status === "out_for_delivery"
        ? "out for delivery"
        : a.production === "ready"
          ? "ready, not sent"
          : "baking";
    detail = `${a.vendorName} · ${stage}`;
    const tel = telHref(a.vendorPhone);
    action = tel ? { kind: "link", href: tel, label: "Call bakery" } : openOrder(o.ref);
  }
  return { key: `late:${o.ref}`, category: "late", tag, title: o.title, detail, action, sortAt: o.due };
}

function stuckItem(o: NeedsYouOrder, now: Date): NeedsYouItem | null {
  if (o.status !== "confirmed") return null;
  const a = o.assignment;
  const base = { key: `stuck:${o.ref}`, category: "stuck" as const, title: o.title, sortAt: o.due ?? o.createdAt };
  if (a?.state === "EXPIRED") {
    const at = a.expiresAt ?? a.respondedAt ?? o.createdAt;
    return {
      ...base,
      tag: `Offer expired ${mins(now.getTime() - at.getTime())} min ago`,
      detail: `${a.vendorName} did not respond`,
      action: openInPanel(o.ref),
    };
  }
  if (a?.state === "REJECTED") {
    return {
      ...base,
      tag: "Rejected",
      detail: a.rejectionReason ? `${a.vendorName}: ${a.rejectionReason}` : `${a.vendorName} turned it down`,
      action: openInPanel(o.ref),
    };
  }
  if (a && HELD.includes(a.state)) return null;
  // No assignment, or one that no longer holds the order (e.g. cancelled).
  return { ...base, tag: "No bakery", detail: "Nobody has this order yet", action: openInPanel(o.ref) };
}

/** Admin kitchen: a confirmed order nobody holds is the admin's to bake. */
function toBakeItem(o: NeedsYouOrder, now: Date): NeedsYouItem | null {
  if (o.status !== "confirmed" || (o.assignment && HELD.includes(o.assignment.state))) return null;
  return {
    key: `tobake:${o.ref}`, category: "new", tag: "To bake", title: o.title,
    detail: `Placed ${mins(now.getTime() - o.createdAt.getTime())} min ago`,
    action: openOrder(o.ref), sortAt: o.due ?? o.createdAt,
  };
}

function newItem(o: NeedsYouOrder, now: Date): NeedsYouItem | null {
  if (o.status !== "draft") return null;
  const phone = telHref(o.customerPhone);
  return {
    key: `new:${o.ref}`,
    category: "new",
    tag: "New",
    title: o.title,
    detail: `Placed ${mins(now.getTime() - o.createdAt.getTime())} min ago${o.paymentLabel ? ` · ${o.paymentLabel}` : ""}`,
    action: { kind: "confirm", ref: o.ref, label: "Confirm" },
    secondary: phone ? { kind: "link", href: phone, label: "Call" } : undefined,
    sortAt: o.due ?? o.createdAt,
  };
}

export function classifyNeedsYou(input: NeedsYouInput, now: Date) {
  const items: NeedsYouItem[] = [];

  // Each order lands in its most urgent category only.
  for (const o of input.orders) {
    const item = input.adminKitchen
      ? lateItem(o, now, true) ?? toBakeItem(o, now) ?? newItem(o, now)
      : lateItem(o, now) ?? (input.liveBakeries > 0 ? stuckItem(o, now) : null) ?? newItem(o, now);
    if (item) items.push({ ...item, href: `/admin/orders/${o.ref}` });
  }

  for (const r of input.reviews) {
    items.push({
      key: `review:${r.vendorId}`, category: "requests", tag: "Ready for review", title: r.name,
      detail: "Finished setup and waiting for approval",
      action: { kind: "link", href: `/admin/vendors/${r.vendorId}`, label: "Review" }, sortAt: r.createdAt,
    });
  }
  for (const q of input.quotes) {
    items.push({
      key: `quote:${q.id}`, category: "requests", tag: "Needs quote", title: q.title,
      detail: "Custom request awaiting a quote",
      action: { kind: "link", href: "/admin/custom-requests", label: "Quote" }, sortAt: q.createdAt,
    });
  }
  for (const f of input.followUps) {
    items.push({
      key: `followup:${f.id}`, category: "requests", tag: f.kind === "refund" ? "Refund due" : "Payment recovery",
      title: f.label, detail: f.kind === "refund" ? "Refund to send" : "Payment to chase",
      action: { kind: "link", href: "/admin/payments", label: "Follow up" }, sortAt: f.createdAt,
    });
  }

  items.sort(
    (a, b) =>
      CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
      a.sortAt.getTime() - b.sortAt.getTime(),
  );

  const counts: Record<Category, number> = { late: 0, stuck: 0, new: 0, requests: 0 };
  for (const i of items) counts[i.category]++;
  return { items, counts, total: items.length };
}

export type GlanceInput = {
  todays: { status: OrderStatus; totalPaise: number; createdAt: Date }[];
  baking: number;
  outForDelivery: number;
  liveBakeries: number;
  activeBakeries: number;
};

/** UTC instant of 00:00 IST on `now`'s IST calendar day. */
export function istDayStart(now: Date): Date {
  const local = now.getTime() + IST_OFFSET_MS;
  return new Date(local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - IST_OFFSET_MS);
}

export function glance(input: GlanceInput, now: Date) {
  const start = istDayStart(now).getTime();
  const counted = input.todays.filter((o) => o.status !== "cancelled" && o.createdAt.getTime() >= start);
  return {
    ordersToday: counted.length,
    bakingNow: input.baking,
    outForDelivery: input.outForDelivery,
    liveBakeries: `${input.liveBakeries} of ${input.activeBakeries}`,
    revenueTodayPaise: counted.reduce((sum, o) => sum + o.totalPaise, 0),
  };
}

export function parseOnly(param: string | string[] | undefined): NeedsYouFilter {
  const v = Array.isArray(param) ? param[0] : param;
  return v === "late" || v === "stuck" || v === "new" || v === "requests" ? v : "all";
}
