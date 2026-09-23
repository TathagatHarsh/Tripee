import 'server-only';
import type { Prisma } from '@prisma/client';
export async function portalEvent(tx: Prisma.TransactionClient, input: { key: string; title: string; message: string; vendorId?: string; orderRef?: string }) {
  const { key, ...data } = input;
  // Admin sees every event. A vendor sees only events addressed to its bakery.
  await tx.portalNotification.upsert({ where: { dedupeKey: key }, update: {}, create: { ...data, dedupeKey: key } });
}
