import type { EarningSnapshot } from "@/components/assignment/Earnings";
import type { VendorOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { migrateConfig, type CakeConfig } from "@/lib/schema";
import { VENDOR_OPEN } from "@/lib/vendors";

const ORDER_FOR_VENDOR = {
  ref: true,
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
      variantLabel: true,
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
      currentFor: { status: { in: ["confirmed", "in_kitchen"] } },
      status: { in: VENDOR_OPEN },
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
    variantLabel: string | null;
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

export async function vendorHistory(
  vendorId: string,
  take = 60,
): Promise<VendorCard[]> {
  const rows = await db.vendorOrder.findMany({
    where: { vendorId, offeredAt: { not: null } },
    orderBy: { assignedAt: "desc" },
    take,
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
  return { ...assignment, order, config: migrateConfig(config) };
}
