import "server-only";
import {
  Prisma,
  type AssignmentStatus,
  type Order,
  type VendorOrderStatus,
} from "@prisma/client";
import { db } from "./db";
import {
  earnings,
  haversine,
  pointFrom,
  vendorEligible,
  type Point,
} from "./assignmentRules";
import { getDistanceMatrix } from "./mapping";
import { outboxCreate } from "./notifications";
import { canVendorTransition, ORDER_STATUS_FOR_VENDOR, STAMP } from "./vendors";
import { canTransition } from "./orders";

import { inventoryForOrder, requireOrderAvailability, InventoryConflict } from './inventory';
import { meetsDeadline } from './inventoryRules';
import { portalEvent } from './portalNotifications';
type Tx = Prisma.TransactionClient;
export class AssignmentConflict extends Error {}
// Short DB-only critical section. Serializes capacity reservation across orders.
// ponytail: deployment-wide assignment lock; partition by dispatch region when
// measured assignment throughput requires it. Provider I/O always runs outside.
export async function lockAssignments(tx: Tx) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(7142026)`;
}
async function lockedOrder(tx: Tx, ref: string) {
  await lockAssignments(tx);
  await tx.$queryRaw`SELECT id FROM "Order" WHERE ref = ${ref} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { ref },
    include: { cakes: { select: { cakeProductId: true, config: true } } },
  });
  if (!order) throw new AssignmentConflict("Order not found");
  return order;
}
const openOrder = (order: Order) =>
  order.status === "confirmed" || order.status === "in_kitchen";
const productsFor = (o: {
  cakes: { cakeProductId: string | null }[];
  cakeProductId: string | null;
}) =>
  o.cakes.length ? o.cakes.map((c) => c.cakeProductId) : [o.cakeProductId];
async function load(tx: Tx, vendorId: string) {
  return tx.vendorOrder.count({
    where: {
      vendorId,
      currentFor: { status: { in: ["confirmed", "in_kitchen"] } },
      assignmentStatus: { in: ["OFFERED", "ACCEPTED"] },
      status: { notIn: ["handed_over", "withdrawn", "rejected"] },
    },
  });
}
async function event(
  tx: Tx,
  orderId: string,
  id: string,
  from: VendorOrderStatus | null,
  to: VendorOrderStatus,
  name: string,
  vendorId?: string,
  reason?: string,
  actorId?: string | null,
) {
  const row = await tx.vendorOrderEvent.create({
    data: {
      vendorOrderId: id,
      fromStatus: from,
      toStatus: to,
      reason: reason ?? name,
      actorId,
    },
  });
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { ref: true } });
  await portalEvent(tx, { key: `assignment:${row.id}`, vendorId, orderRef: order.ref, title: name === 'offered' ? 'New order request' : name.replaceAll('_', ' '), message: `${order.ref}: ${reason ?? name.replaceAll('_', ' ')}` });
  await tx.notificationOutbox.create({
    data: outboxCreate({
      orderId,
      vendorId,
      kind: name === "offered" ? "vendor_assigned" : "status_changed",
      dedupeKey: `assignment-event:${row.id}`,
      payload: { event: name, assignmentId: id, reason: reason ?? null },
    }),
  });
}
async function closeWaiting(tx: Tx, orderId: string) {
  await tx.vendorOrder.updateMany({
    where: { orderId, assignmentStatus: "PENDING" },
    data: { assignmentStatus: "CANCELLED", status: "withdrawn" },
  });
}
function offerExpiresAt(now: Date) {
  const seconds = Number(process.env.ASSIGNMENT_RESPONSE_SECONDS ?? 900);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 86400) throw new Error('Invalid assignment response window');
  return new Date(now.getTime() + seconds * 1000);
}
async function advance(tx: Tx, order: Awaited<ReturnType<typeof lockedOrder>>) {
  if (!openOrder(order) || order.currentAssignmentId) return;
  if (process.env.ASSIGNMENT_AUTO_REASSIGN !== 'true') {
    await closeWaiting(tx, order.id);
    await tx.order.update({ where: { id: order.id }, data: { assignmentState: 'MANUAL', assignmentNote: 'Awaiting admin vendor selection' } });
    return;
  }
  const rows = await tx.vendorOrder.findMany({
    where: { orderId: order.id, assignmentStatus: "PENDING" },
    orderBy: { sequence: "asc" },
    include: { vendor: true },
  });
  for (const row of rows) {
    const vendor = row.vendor;
    const point = pointFrom(order.deliveryLocation),
      origin = pointFrom(vendor);
    if (
      !vendorEligible(vendor, productsFor(order), await load(tx, vendor.id), new Date(), order.fulfillmentMethod !== "pickup") ||
      (order.fulfillmentMethod !== "pickup" && (!point || !origin || haversine(origin, point) > vendor.serviceRadiusKm)) ||
      (order.fulfillmentMethod !== "pickup" && (row.distanceKm ?? Infinity) > vendor.serviceRadiusKm)
    ) {
      await tx.vendorOrder.update({
        where: { id: row.id },
        data: {
          assignmentStatus: "CANCELLED",
          status: "withdrawn",
          rejectionReason: "No longer eligible before offer",
        },
      });
      continue;
    }
    const stock = await inventoryForOrder(tx, vendor.id, order).catch(() => []);
    if (!stock.length || stock.some(({ item }) => !item?.isAvailable) || !meetsDeadline(order.dueAt ?? order.requestedFor, vendor.preparationMinutes, row.estimatedMinutes ?? 0)) {
      await tx.vendorOrder.update({ where: { id: row.id }, data: { assignmentStatus: 'CANCELLED', status: 'withdrawn', rejectionReason: 'Cake variant unavailable or insufficient preparation time' } });
      continue;
    }
    const offeredAt = new Date();
    await tx.vendorOrder.update({
      where: { id: row.id },
      data: {
        assignmentStatus: "OFFERED",
        status: "assigned",
        offeredAt,
        assignedAt: offeredAt,
        expiresAt: offerExpiresAt(offeredAt),
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        currentAssignmentId: row.id,
        assignmentState: "OFFERED",
        assignmentNote: null,
      },
    });
    await event(tx, order.id, row.id, null, "assigned", "offered", vendor.id);
    return;
  }
  await tx.order.update({
    where: { id: order.id },
    data: {
      assignmentState: "MANUAL",
      assignmentNote:
        "No eligible bakery remains. Main bakery intervention required.",
    },
  });
  await tx.notificationOutbox.upsert({
    where: { dedupeKey: `manual:${order.id}:${rows.at(-1)?.id ?? "none"}` },
    update: {},
    create: outboxCreate({
      orderId: order.id,
      kind: "status_changed",
      dedupeKey: `manual:${order.id}:${rows.at(-1)?.id ?? "none"}`,
      payload: { event: "manual_intervention" },
    }),
  });
}
export async function assignmentCandidates(ref: string) {
  const order = await db.order.findUnique({ where: { ref }, include: { cakeProduct: { select: { name: true } }, cakes: { select: { cakeProductId: true, cakeName: true, cakeProduct: { select: { name: true } }, config: true } } } });
  if (!order) throw new AssignmentConflict('Order not found');
  const customer = pointFrom(order.deliveryLocation);
  const pickup = order.fulfillmentMethod === 'pickup';
  const vendors = await db.vendor.findMany({ orderBy: { name: 'asc' } });
  const productNames = new Map((order.cakes.length ? order.cakes : [order]).map(cake => [cake.cakeProductId, cake.cakeName ?? cake.cakeProduct?.name ?? 'Cake']));
  const rows = [];
  for (const vendor of vendors) {
    const reasons: string[] = [];
    const currentLoad = await load(db, vendor.id);
    if (!vendor.isActive) reasons.push('Inactive bakery');
    if (!vendor.isAcceptingOrders) reasons.push('Not accepting orders');
    if (vendor.unavailableUntil && vendor.unavailableUntil > new Date()) reasons.push('Bakery unavailable');
    if (currentLoad >= vendor.maxConcurrentOrders) reasons.push('At capacity');
    if (!vendor.fulfillsAllProducts && !productsFor(order).every(id => id && vendor.supportedProductIds.includes(id))) reasons.push('Product not supported');
    let inventory: { product: string; isAvailable: boolean }[] = [];
    try {
      inventory = (await inventoryForOrder(db, vendor.id, order)).map(({ item, need }) => {
        const name = item?.productName ?? productNames.get(need.productId) ?? 'Cake';
        if (!item?.isAvailable) reasons.push(`${name} ${need.sizeBand} ${need.eggType}: unavailable`);
        return { product: `${name} · ${need.sizeBand} · ${need.eggType}`, isAvailable: item?.isAvailable ?? false };
      });
    } catch (error) { reasons.push((error as Error).message); }
    const origin = pointFrom(vendor);
    const straightLineKm = customer && origin ? haversine(origin, customer) : null;
    let route: { distanceKm: number | null; estimatedMinutes: number | null; source: string } = pickup
      ? { distanceKm: 0, estimatedMinutes: 0, source: 'pickup' }
      : straightLineKm !== null
        ? { distanceKm: straightLineKm, estimatedMinutes: (straightLineKm / 20) * 60, source: 'haversine_estimate' }
        : { distanceKm: null, estimatedMinutes: null, source: 'unknown' };
    if (!pickup) {
      if (!customer || !origin) reasons.push('Verified location required');
      else if (straightLineKm! > vendor.serviceRadiusKm) reasons.push('Outside service area');
      else if (!reasons.length || reasons.every(reason => reason === 'At capacity')) {
        const estimate = (await getDistanceMatrix([origin], customer))[0];
        if (estimate) route = estimate;
        if (!estimate || estimate.distanceKm > vendor.serviceRadiusKm) reasons.push('No route within service area');
      }
    }
    if (route.estimatedMinutes !== null && !meetsDeadline(order.dueAt ?? order.requestedFor, vendor.preparationMinutes, route.estimatedMinutes)) reasons.push('Cannot meet preparation deadline');
    rows.push({ ...route, vendorId: vendor.id, name: vendor.name, inventory, preparationMinutes: vendor.preparationMinutes, currentLoad, capacity: vendor.maxConcurrentOrders, busy: vendor.isBusy, eligible: reasons.length === 0, reasons });
  }
  return rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(a.busy) - Number(b.busy) || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
export async function findEligibleBakeries(ref: string) {
  return (await assignmentCandidates(ref)).filter(row => row.eligible);
}
/** Idempotent; the worker also discovers PENDING/ASSIGNING orders after crashes. */
export async function startAssignment(ref: string) {
  // Checkout creates demand; only the admin chooses the first bakery.
  await db.order.updateMany({ where: { ref, currentAssignmentId: null, assignmentState: { in: ['PENDING', 'ASSIGNING'] } }, data: { assignmentState: 'MANUAL', assignmentNote: 'Awaiting admin vendor selection' } });
  return;
}
export async function respondToAssignment(
  vendorId: string,
  ref: string,
  id: string,
  response: "ACCEPTED" | "REJECTED",
  reason?: string,
  actorId?: string,
) {
  if (response === 'REJECTED' && !reason?.trim()) throw new AssignmentConflict('A rejection reason is required.');
  return db.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ref);
    const row = await tx.vendorOrder.findFirst({
      where: { id, orderId: order.id, vendorId },
    });
    if (
      !row ||
      order.currentAssignmentId !== id ||
      !openOrder(order) ||
      row.assignmentStatus !== "OFFERED"
    )
      throw new AssignmentConflict(
        "This offer is no longer available or the order is already assigned.",
      );
    const actingVendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!actingVendor?.isActive) throw new AssignmentConflict('Bakery unavailable');
    const now = new Date();
    if (row.expiresAt && row.expiresAt <= now) {
      await finishOffer(tx, order, row.id, vendorId, "EXPIRED");
      return {
        ok: false,
        message: "This offer expired. The order has returned for reassignment.",
      };
    }
    if (response === "REJECTED")
      await finishOffer(tx, order, id, vendorId, response, reason, actorId);
    else {
      const vendor = await tx.vendor.findUniqueOrThrow({
        where: { id: vendorId },
      });
      if (
        !vendorEligible(
          vendor,
          productsFor(order),
          Math.max(0, (await load(tx, vendorId)) - 1),
          new Date(),
          order.fulfillmentMethod !== "pickup",
        ) ||
        (order.fulfillmentMethod !== "pickup" && (row.distanceKm ?? Infinity) > vendor.serviceRadiusKm)
      )
        throw new AssignmentConflict(
          "Your bakery is currently unavailable. Reject the offer to advance it.",
        );
      try { await requireOrderAvailability(tx, vendorId, order); }
      catch (error) { if (error instanceof InventoryConflict) throw new AssignmentConflict(error.message); throw error; }
      if (!meetsDeadline(order.dueAt ?? order.requestedFor, vendor.preparationMinutes, row.estimatedMinutes ?? 0)) throw new AssignmentConflict('Preparation deadline cannot be met. Reject with a reason.');
      await tx.vendorOrder.update({
        where: { id },
        data: {
          assignmentStatus: "ACCEPTED",
          status: "accepted",
          acceptedAt: now,
          respondedAt: now,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { assignmentState: "ASSIGNED" },
      });
      await closeWaiting(tx, order.id);
      await event(
        tx,
        order.id,
        id,
        "assigned",
        "accepted",
        "accepted",
        vendorId,
        undefined,
        actorId,
      );
    }
    return {
      ok: true,
      message:
        response === "ACCEPTED"
          ? "Order accepted. Your earnings are locked in."
          : "Order rejected; admin notified.",
    };
  });
}
async function finishOffer(
  tx: Tx,
  order: Awaited<ReturnType<typeof lockedOrder>>,
  id: string,
  vendorId: string,
  status: AssignmentStatus,
  reason?: string,
  actorId?: string,
) {
  const now = new Date(),
    rejected = status === "REJECTED";
  await tx.vendorOrder.update({
    where: { id },
    data: {
      assignmentStatus: status,
      status: rejected ? "rejected" : "withdrawn",
      respondedAt: rejected ? now : null,
      ...(rejected ? { rejectedAt: now } : { withdrawnAt: now }),
      rejectionReason:
        reason?.slice(0, 500) || (rejected ? null : "Response window expired"),
    },
  });
  await tx.order.update({
    where: { id: order.id },
    data: { currentAssignmentId: null },
  });
  await event(
    tx,
    order.id,
    id,
    "assigned",
    rejected ? "rejected" : "withdrawn",
    status.toLowerCase(),
    vendorId,
    reason,
    actorId,
  );
  await advance(tx, { ...order, currentAssignmentId: null });
}
export async function expireAndAdvance(ref: string) {
  await db.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ref);
    if (!openOrder(order)) return;
    const row = order.currentAssignmentId
      ? await tx.vendorOrder.findUnique({
          where: { id: order.currentAssignmentId },
        })
      : null;
    if (
      row?.assignmentStatus === "OFFERED" &&
      row.expiresAt &&
      row.expiresAt <= new Date()
    )
      await finishOffer(tx, order, row.id, row.vendorId, "EXPIRED");
    else if (!row && order.assignmentState === "ASSIGNING")
      await advance(tx, order);
  });
}
export async function manualAssignment(
  ref: string,
  vendorId: string,
  actorId: string | null,
  expectedAssignmentId?: string | null,
) {
  const before = await db.order.findUnique({ where: { ref }, select: { currentAssignmentId: true, deliveryLocation: true } });
  const expected = expectedAssignmentId === undefined ? before?.currentAssignmentId : expectedAssignmentId;
  const candidates = (await assignmentCandidates(ref)).filter(c => c.eligible);
  const candidate = candidates.find((c) => c.vendorId === vendorId);
  const pickup = candidate?.source === 'pickup';
  if (!candidate || candidate.distanceKm === null || candidate.estimatedMinutes === null)
    throw new AssignmentConflict(
      "Bakery is outside its service area, at capacity, or cannot fulfill this order.",
    );
  const { distanceKm, estimatedMinutes } = candidate;
  await db.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ref);
    if (order.currentAssignmentId !== expected) throw new AssignmentConflict('Assignment changed. Refresh before assigning.');
    if (JSON.stringify(order.deliveryLocation) !== JSON.stringify(before?.deliveryLocation)) throw new AssignmentConflict('Delivery location changed. Refresh candidates.');
    if (!openOrder(order))
      throw new AssignmentConflict(
        "Closed or unconfirmed orders cannot be reassigned",
      );
    const vendor = await tx.vendor.findUniqueOrThrow({
      where: { id: vendorId },
    });
    if (
      !vendorEligible(
        vendor,
        productsFor(order),
        await load(tx, vendorId),
        new Date(),
        !pickup,
      ) ||
      (candidate.distanceKm !== null &&
        candidate.distanceKm > vendor.serviceRadiusKm)
    )
      throw new AssignmentConflict("Bakery is no longer eligible");
    const old = order.currentAssignmentId
      ? await tx.vendorOrder.findUnique({
          where: { id: order.currentAssignmentId },
        })
      : null;
    if (old?.status === 'handed_over') throw new AssignmentConflict('A handed-over order cannot be reassigned.');
    if (old?.vendorId === vendorId) throw new AssignmentConflict('This bakery already holds the order.');
    if (!meetsDeadline(order.dueAt ?? order.requestedFor, vendor.preparationMinutes, estimatedMinutes)) throw new AssignmentConflict('Cannot meet preparation deadline');
    if (old) {
      await tx.vendorOrder.update({
        where: { id: old.id },
        data: {
          assignmentStatus: "CANCELLED",
          status: "withdrawn",
          withdrawnAt: new Date(),
        },
      });
      await event(
        tx,
        order.id,
        old.id,
        old.status,
        "withdrawn",
        "reassigned",
        old.vendorId,
        "Reassigned by the main bakery",
      );
    }
    await closeWaiting(tx, order.id);
    const last = await tx.vendorOrder.aggregate({
      where: { orderId: order.id },
      _max: { sequence: true },
    });
    const now = new Date();
    const row = await tx.vendorOrder.create({
      data: {
        orderId: order.id,
        vendorId,
        assignedById: actorId,
        capacityOverride: false,
        sequence: (last._max.sequence ?? 0) + 1,
        assignmentStatus: "OFFERED",
        status: "assigned",
        offeredAt: now,
        expiresAt: offerExpiresAt(now),
        orderValuePaise: order.totalPaise,
        distanceKm,
        estimatedMinutes,
        routeSource: candidate.source,
        ...earnings(
          order.productSubtotalPaise,
          vendor.commissionBps,
          vendor.assignmentFeePaise,
        ),
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        currentAssignmentId: row.id,
        assignmentState: "OFFERED",
        assignmentNote: "Waiting for vendor response.",
      },
    });
    try { await requireOrderAvailability(tx, vendorId, order); }
    catch (error) { if (error instanceof InventoryConflict) throw new AssignmentConflict(error.message); throw error; }
    await event(tx, order.id, row.id, null, "assigned", "offered", vendorId, "Cake variants available; awaiting vendor response", actorId);
    if (process.env.ASSIGNMENT_AUTO_REASSIGN === 'true') {
      // Only an admin-created round can opt into automatic fallback offers.
      for (const [i, other] of candidates.filter(c => c.vendorId !== vendorId).entries()) {
        const target = await tx.vendor.findUniqueOrThrow({ where: { id: other.vendorId } });
        await tx.vendorOrder.create({ data: { orderId: order.id, vendorId: target.id, sequence: row.sequence + i + 1, assignmentStatus: 'PENDING', distanceKm: other.distanceKm, estimatedMinutes: other.estimatedMinutes, routeSource: other.source, orderValuePaise: order.totalPaise, ...earnings(order.productSubtotalPaise, target.commissionBps, target.assignmentFeePaise) } });
      }
    }
  });
}
export async function moveFulfillment(
  vendorId: string,
  ref: string,
  to: VendorOrderStatus,
  assignmentId?: string,
  actorId?: string,
) {
  return db.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ref);
    const row = order.currentAssignmentId
      ? await tx.vendorOrder.findUnique({
          where: { id: order.currentAssignmentId },
        })
      : null;
    if (
      !row ||
      row.vendorId !== vendorId ||
      row.id !== assignmentId ||
      row.assignmentStatus !== "ACCEPTED" ||
      !openOrder(order) ||
      !canVendorTransition(row.status, to)
    )
      return false;
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor?.isActive) return false;
    const next = ORDER_STATUS_FOR_VENDOR[to];
    if (next && order.status !== next && !canTransition(order.status, next))
      return false;
    await tx.vendorOrder.update({
      where: { id: row.id },
      data: { status: to, [STAMP[to]]: new Date() },
    });
    await event(tx, order.id, row.id, row.status, to, to, vendorId, undefined, actorId);
    if (next && next !== order.status) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: next },
      });
      await tx.orderEvent.create({
        data: { orderId: order.id, fromStatus: order.status, toStatus: next },
      });
    }
    return true;
  });
}
export async function runAssignmentWorker() {
  const orders = await db.order.findMany({
    where: {
      fulfillmentMethod: "delivery",
      status: { in: ["confirmed", "in_kitchen"] },
      OR: [
        { assignmentState: { in: ["PENDING", "ASSIGNING"] } },
        {
          currentAssignment: {
            assignmentStatus: "OFFERED",
            expiresAt: { lte: new Date() },
          },
        },
      ],
    },
    select: { ref: true },
    take: 10,
    orderBy: { createdAt: "asc" },
  });
  let processed = 0;
  for (const order of orders)
    try {
      await startAssignment(order.ref);
      await expireAndAdvance(order.ref);
      processed++;
    } catch (error) {
      console.error("assignment_worker_failed", {
        ref: order.ref,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  return { scanned: orders.length, processed };
}

/** Correct an unassigned delivery pin after speaking with the customer. */
export async function correctDeliveryPin(
  ref: string,
  point: Point,
  actorId: string,
) {
  if (!pointFrom(point))
    throw new AssignmentConflict("Invalid delivery coordinates");
  await db.$transaction(async (tx) => {
    const order = await lockedOrder(tx, ref);
    if (
      !openOrder(order) ||
      order.fulfillmentMethod !== "delivery" ||
      order.currentAssignmentId
    )
      throw new AssignmentConflict(
        "Only unassigned delivery orders can have their location corrected",
      );
    const old =
      order.deliveryLocation &&
      typeof order.deliveryLocation === "object" &&
      !Array.isArray(order.deliveryLocation)
        ? order.deliveryLocation
        : {};
    await tx.order.update({
      where: { id: order.id },
      data: {
        deliveryLocation: {
          ...old,
          latitude: point.lat,
          longitude: point.lng,
          source: "admin_verified",
        },
        assignmentState: "PENDING",
        assignmentNote: null,
      },
    });
    await closeWaiting(tx, order.id);
    await tx.notificationOutbox.create({
      data: outboxCreate({
        orderId: order.id,
        kind: "status_changed",
        dedupeKey: `location:${order.id}:${crypto.randomUUID()}`,
        payload: { event: "delivery_location_corrected", actorId },
      }),
    });
  });
  await startAssignment(ref);
}
