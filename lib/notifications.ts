import "server-only";
import { Prisma, type NotificationKind } from "@prisma/client";
import { db } from "./db";
import { log } from "./log";

export interface OutboxInput {
  orderId: string;
  vendorId?: string | null;
  kind: NotificationKind;
  destination?: string | null;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
}

export function outboxCreate(input: OutboxInput): Prisma.NotificationOutboxCreateArgs["data"] {
  return {
    orderId: input.orderId,
    vendorId: input.vendorId ?? null,
    kind: input.kind,
    channel: "webhook",
    destination: input.destination ?? null,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
  };
}

async function sendWebhook(message: {
  id: string;
  kind: NotificationKind;
  destination: string | null;
  payload: Prisma.JsonValue;
}): Promise<void> {
  const url = process.env.NOTIFICATION_WEBHOOK_URL;
  const token = process.env.NOTIFICATION_WEBHOOK_TOKEN;
  if (!url || !token) throw new Error("notification_provider_unconfigured");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": message.id,
    },
    body: JSON.stringify(message),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`notification_provider_${response.status}`);
}

export async function dispatchPendingNotifications(limit = 20): Promise<{
  sent: number;
  failed: number;
}> {
  const now = new Date();
  // availableAt is the retry time while idle and the claim lease while sending.
  // A final crashed attempt must remain visible as failed rather than sending.
  await db.notificationOutbox.updateMany({
    where: { status: "sending", attempts: { gte: 8 }, availableAt: { lte: now } },
    data: { status: "failed", lastError: "notification_claim_expired" },
  });
  const candidates = await db.notificationOutbox.findMany({
    where: {
      status: { in: ["pending", "failed", "sending"] },
      attempts: { lt: 8 },
      availableAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
  });

  let sent = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const leaseUntil = new Date(Date.now() + 60_000);
    const claimed = await db.notificationOutbox.updateMany({
      where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts, availableAt: candidate.availableAt },
      data: { status: "sending", attempts: { increment: 1 }, availableAt: leaseUntil },
    });
    if (claimed.count !== 1) continue;
    const claim = { id: candidate.id, status: "sending" as const, attempts: candidate.attempts + 1, availableAt: leaseUntil };

    try {
      await sendWebhook(candidate);
      const completed = await db.notificationOutbox.updateMany({
        where: claim,
        data: { status: "sent", sentAt: new Date(), lastError: null },
      });
      if (completed.count !== 1) continue;
      sent++;
      log("info", "notification_sent", { id: candidate.id, kind: candidate.kind });
    } catch (error) {
      const delayMinutes = Math.min(60, 2 ** Math.min(candidate.attempts, 6));
      const completed = await db.notificationOutbox.updateMany({
        where: claim,
        data: {
          status: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 500) : "notification_failed",
          availableAt: new Date(Date.now() + delayMinutes * 60_000),
        },
      });
      if (completed.count !== 1) continue;
      failed++;
      log("error", "notification_failed", {
        id: candidate.id,
        kind: candidate.kind,
        attempt: candidate.attempts + 1,
      });
    }
  }

  return { sent, failed };
}
