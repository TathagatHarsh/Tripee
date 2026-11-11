import "server-only";
import type { Prisma } from "@prisma/client";

/** Replies to automated order email go to the inbox a person reads. */
const REPLY_TO = "hello@makeyourcakes.com";

/**
 * Deliver one email outbox row through Resend. Throws on any failure so the
 * outbox records it and retries; the row id is Resend's idempotency key, so a
 * retry after a lost response cannot send the email twice.
 */
export async function sendEmail(row: { id: string; destination: string | null; payload: Prisma.JsonValue }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("email_provider_unconfigured");
  if (!row.destination) throw new Error("email_destination_missing");
  const { subject, text, html } = row.payload as { subject: string; text: string; html: string };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "idempotency-key": row.id,
    },
    body: JSON.stringify({ from, to: [row.destination], reply_to: REPLY_TO, subject, text, html }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`email_provider_${response.status}`);
}
