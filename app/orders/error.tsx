"use client";

import Link from "next/link";
import { btn, eyebrow } from "@/lib/ui";

/**
 * When the orders could not be read.
 *
 * ## What a customer is told, and what they are not
 *
 * Not the error. A Prisma message names the host, the table and often the query;
 * a Clerk one names the deployment's configuration. None of that is a customer's
 * to see and none of it helps them, so this says the true and useful half —
 * something on our side did not answer — and offers the two things that actually
 * resolve it: try again, or go somewhere that works. Next has already logged the
 * real error on the server, where somebody can act on it.
 *
 * `reset()` re-renders the segment rather than reloading the document, so a
 * transient failure — a cold database, a dropped connection — costs one press
 * and no round trip through the shopfront.
 *
 * This boundary also catches the "role could not be read" throw from
 * lib/auth's `requireRole`. That is deliberate: on a deployment with no
 * DATABASE_URL, a signed-in customer gets this sheet instead of a stack trace,
 * and the cause is in the server logs where lib/auth put it.
 */
export default function OrdersError({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className={eyebrow}>Orders</span>
        <h1 className="font-mono text-heading text-ink">Your orders</h1>
      </div>

      <div className="paper-edge bg-paper">
        <span className={`${eyebrow} block border-b border-rule px-5 py-3`}>Something went wrong</span>
        <div className="flex flex-col items-start gap-4 px-5 py-8 sm:px-8">
          <h2 className="font-mono text-title text-ink">
            We couldn&rsquo;t load your orders
          </h2>
          <p className="max-w-[50ch] font-sans text-body leading-relaxed text-steel">
            That is our end rather than yours, and your orders are not affected —
            nothing has been changed or cancelled. Try again, and if it keeps
            happening ring the bakery with your order reference.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={reset} className={btn("primary", "md")}>
              Try again
            </button>
            <Link href="/account" className={btn("secondary", "md")}>
              Your account
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
