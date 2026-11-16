import type { AssignmentStatus, OrderStatus, Prisma, VendorOrderStatus } from "@prisma/client";
import { formatIST } from "./format";
import { istDayStart } from "./needsYou";
import { UNDELIVERABLE } from "./orders";

/**
 * The orders workspace's pure helpers: which view is on, what a row's bakery
 * line says, and how each automatic offer reads in the quick-view panel.
 * No database and no server-only imports, so pages and tests share them.
 */

export type OrderView = "needs" | "today" | "upcoming" | "all";
const VIEWS: OrderView[] = ["needs", "today", "upcoming", "all"];

type Params = Record<string, string | string[] | undefined>;
const first = (p: string | string[] | undefined) => (Array.isArray(p) ? p[0] : p);

export function parseView(p: string | string[] | undefined): OrderView {
  const v = first(p);
  return VIEWS.includes(v as OrderView) ? (v as OrderView) : "needs";
}

/** The filters the page had before views. Any of them keeps the old behaviour, so old links still work. */
const LEGACY = ["status", "days", "slot", "due", "production"] as const;

export function hasLegacyFilters(params: Params): boolean {
  return LEGACY.some((k) => !!first(params[k])?.trim());
}

const DAY_MS = 24 * 60 * 60_000;

/** Due in an IST window: `dueAt`, or `requestedFor` when an order has no `dueAt`. */
function dueIn(range: { gte: Date; lt?: Date }): Prisma.OrderWhereInput {
  return { OR: [{ dueAt: range }, { dueAt: null, requestedFor: range }] };
}

export function viewWhere(view: "today" | "upcoming", now: Date): Prisma.OrderWhereInput {
  const start = new Date(istDayStart(now));
  const tomorrow = new Date(start.getTime() + DAY_MS);
  return view === "today"
    ? { AND: [dueIn({ gte: start, lt: tomorrow }), { status: { not: "cancelled" } }] }
    : { AND: [dueIn({ gte: tomorrow }), { status: { notIn: ["delivered", "cancelled"] } }] };
}

export type Attempt = {
  vendorName: string;
  vendorPhone: string | null;
  state: AssignmentStatus;
  production: VendorOrderStatus;
  sequence: number;
  offeredAt: Date | null;
  respondedAt: Date | null;
  expiresAt: Date | null;
  rejectionReason: string | null;
};

const STAGE: Partial<Record<VendorOrderStatus, string>> = {
  accepted: "accepted",
  in_preparation: "baking",
  ready: "ready",
  handed_over: "sent out",
};

const PENDING: AssignmentStatus[] = ["PENDING", "OFFERED"];

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export function bakeryLine(
  order: { status: OrderStatus; cancellationReason: string | null },
  attempts: Attempt[],
): string {
  if (order.status === "cancelled" && order.cancellationReason === UNDELIVERABLE) return "No bakery could take it";
  const held = attempts.find((a) => a.state === "ACCEPTED");
  if (held) return `${held.vendorName} · ${STAGE[held.production] ?? "accepted"}`;
  if (attempts.some((a) => PENDING.includes(a.state))) {
    return attempts.length > 1 ? `finding a bakery (${ordinal(attempts.length)} try)` : "finding a bakery";
  }
  if (!attempts.length && order.status === "draft") return "waiting for confirmation";
  return "";
}

const at = (d: Date | null) => (d ? ` · ${formatIST(d)}` : "");

export function attemptLines(attempts: Attempt[], now: Date): string[] {
  return [...attempts]
    .sort((a, b) => a.sequence - b.sequence)
    .map((a) => {
      switch (a.state) {
        case "PENDING":
        case "OFFERED": {
          const waited = a.offeredAt ? Math.max(0, Math.floor((now.getTime() - a.offeredAt.getTime()) / 60_000)) : 0;
          return `Offered to ${a.vendorName} · waiting ${waited} min`;
        }
        case "ACCEPTED":
          return `Accepted by ${a.vendorName}${at(a.respondedAt ?? a.offeredAt)}`;
        case "REJECTED":
          return `${a.vendorName} said no${a.rejectionReason ? ` (${a.rejectionReason})` : ""}${at(a.respondedAt)}`;
        case "EXPIRED":
          return `${a.vendorName} didn't answer in time${at(a.expiresAt ?? a.respondedAt)}`;
        default:
          return `Offer to ${a.vendorName} withdrawn${at(a.respondedAt)}`;
      }
    });
}

const phone = (p: string | null) => (p?.trim() ? p.trim() : null);

/** The bakery holding the order, else the latest one offered, else the latest one tried. */
export function callBakeryPhone(attempts: Attempt[]): string | null {
  const accepted = attempts.find((a) => a.state === "ACCEPTED");
  if (accepted) return phone(accepted.vendorPhone);
  const latest = [...attempts].sort((a, b) => b.sequence - a.sequence);
  const offered = latest.find((a) => PENDING.includes(a.state));
  return phone((offered ?? latest[0])?.vendorPhone ?? null);
}

/** Legacy filter links keep the old page; otherwise a view. A search with no view looks through everything. */
export function effectiveMode(params: Params): "legacy" | { kind: "view"; view: OrderView } {
  if (hasLegacyFilters(params)) return "legacy";
  if (first(params.view)) return { kind: "view", view: parseView(params.view) };
  return { kind: "view", view: first(params.q)?.trim() ? "all" : "needs" };
}

function ordersHref(params: Params, open?: string): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const value = first(v);
    if (k !== "open" && value) qs.set(k, value);
  }
  if (open) qs.set("open", open);
  const s = qs.toString();
  return s ? `/admin/orders?${s}` : "/admin/orders";
}

/** Open an order in the quick view without losing the current view, filters or search. */
export const rowHref = (params: Params, ref: string) => ordersHref(params, ref);
/** Close the quick view: the same list, minus `open`. */
export const closeHref = (params: Params) => ordersHref(params);
