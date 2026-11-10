import type { EarningSnapshot } from "@/components/assignment/Earnings";
import type { OrderStatus, VendorOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { migrateConfig, type CakeConfig } from "@/lib/schema";
import { VENDOR_OPEN, VENDOR_STATUS_LABEL } from "@/lib/vendors";

const ORDER_FOR_VENDOR = {
  ref: true,
  status: true,
  fulfillmentMethod: true,
  customerName: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  pincode: true,
  deliveryLocation: true,
  deliverySlot: true,
  leadHours: true,
  createdAt: true,
  requestedFor: true,
  dueAt: true,
  confirmedAt: true,
  requestedWindow: true,
  customerNotes: true,
  cakes: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      cakeName: true,
      cakeImageUrl: true,
      variantLabel: true,
      message: true,
      allergens: true,
      productionSpec: true,
      config: true,
    },
  },
  allergens: true,
  servesMin: true,
  servesMax: true,
  cakeName: true,
  cakeImageUrl: true,
  config: true,
} as const;

export async function vendorBoard(vendorId: string): Promise<VendorCard[]> {
  const rows = await db.vendorOrder.findMany({
    where: {
      vendorId,
      assignmentStatus: { in: ["OFFERED", "ACCEPTED"] },
      /* Out for delivery stays on the board: the bakery is the one who marks
         it delivered (lib/vendors' vendorNext). */
      currentFor: { status: { in: ["confirmed", "in_kitchen", "out_for_delivery"] } },
      status: { in: [...VENDOR_OPEN, "handed_over"] },
    },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      orderValuePaise: true,
      commissionPaise: true,
      feePaise: true,
      vendorEarningPaise: true,
      distanceKm: true,
      estimatedMinutes: true,
      routeSource: true,
      expiresAt: true,
      order: { select: ORDER_FOR_VENDOR },
    },
  });
  return rows.map(toCard);
}

export interface VendorCardOrder {
  ref: string;
  status: OrderStatus;
  fulfillmentMethod: "delivery" | "pickup";
  customerName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  deliveryLocation: unknown;
  deliverySlot: string;
  leadHours: number;
  createdAt: Date;
  requestedFor: Date | null;
  dueAt: Date | null;
  confirmedAt: Date | null;
  requestedWindow: string | null;
  customerNotes: string | null;
  cakes: {
    id: string;
    cakeName: string | null;
    cakeImageUrl: string | null;
    variantLabel: string | null;
    message?: string | null;
    allergens: string[];
    productionSpec: unknown;
    config: unknown;
  }[];
  allergens: string[];
  servesMin: number;
  servesMax: number;

  cakeName: string | null;

  cakeImageUrl: string | null;
}

export interface VendorCard extends EarningSnapshot {
  id: string;
  status: VendorOrderStatus;
  assignedAt: Date;
  order: VendorCardOrder;

  config: CakeConfig | null;
}

function toCard(
  row: EarningSnapshot & {
    id: string;
    status: VendorOrderStatus;
    assignedAt: Date;
    order: VendorCardOrder & { config: unknown };
  },
): VendorCard {
  const { config, ...order } = row.order;
  return { ...row, order, config: migrateConfig(config) };
}

export const HISTORY_PAGE = 60;

/**
 * One page of history, newest first, with search, status and due date applied
 * in the database before the limit — so an old order is findable by reference
 * however many came after it. Priority is relative to now and stays in
 * filterQueue, which also re-checks the date against the computed due time.
 */
export async function vendorHistory(
  vendorId: string,
  query: { q?: string; status?: string; date?: string } = {},
  page = 0,
): Promise<{ cards: VendorCard[]; more: boolean }> {
  const q = query.q?.trim();
  const status =
    query.status && query.status in VENDOR_STATUS_LABEL
      ? (query.status as VendorOrderStatus)
      : undefined;
  const contains = (v: string) => ({ contains: v, mode: "insensitive" as const });
  /* Due date is an IST calendar day (QueueFilters adds +05:30). */
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "")
    ? new Date(`${query.date}T00:00:00+05:30`)
    : null;
  const range = day && { gte: day, lt: new Date(day.getTime() + 86_400_000) };
  const rows = await db.vendorOrder.findMany({
    where: {
      vendorId,
      offeredAt: { not: null },
      ...(status ? { status } : {}),
      order: {
        ...(q
          ? {
              OR: [
                { ref: contains(q) },
                { customerName: contains(q) },
                { cakeName: contains(q) },
                { cakes: { some: { cakeName: contains(q) } } },
              ],
            }
          : {}),
        ...(range
          ? {
              AND: {
                OR: [
                  { dueAt: range },
                  { dueAt: null, requestedFor: range },
                  { dueAt: null, requestedFor: null },
                ],
              },
            }
          : {}),
      },
    },
    orderBy: { assignedAt: "desc" },
    skip: page * HISTORY_PAGE,
    take: HISTORY_PAGE + 1,
    select: {
      id: true,
      status: true,
      assignedAt: true,
      orderValuePaise: true,
      commissionPaise: true,
      feePaise: true,
      vendorEarningPaise: true,
      distanceKm: true,
      estimatedMinutes: true,
      routeSource: true,
      expiresAt: true,
      order: { select: ORDER_FOR_VENDOR },
    },
  });
  return {
    cards: rows.slice(0, HISTORY_PAGE).map(toCard),
    more: rows.length > HISTORY_PAGE,
  };
}

export async function vendorOrder(vendorId: string, ref: string) {
  const assignment = await db.vendorOrder.findFirst({
    where: { vendorId, offeredAt: { not: null }, order: { ref } },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      orderValuePaise: true,
      commissionPaise: true,
      feePaise: true,
      vendorEarningPaise: true,
      distanceKm: true,
      estimatedMinutes: true,
      routeSource: true,
      expiresAt: true,
      acceptedAt: true,
      rejectedAt: true,
      startedAt: true,
      readyAt: true,
      handedOverAt: true,
      withdrawnAt: true,
      rejectionReason: true,
      order: { select: ORDER_FOR_VENDOR },
    },
  });

  if (!assignment) return null;

  /* A stored config that no longer validates is a real state, not an error —
     lib/schema's migrateConfig returns null for one, and the page says so in
     words. Everything operational is a column and survives it. */
  const { config, ...order } = assignment.order;
  // A custom-cake order has no designer config; its size and flavour are in cakeName, its message in customerNotes.
  const custom = (config as { custom?: unknown } | null)?.custom === true;
  return { ...assignment, order, config: migrateConfig(config), custom };
}
