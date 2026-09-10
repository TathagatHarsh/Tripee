"use client";

import Link from "next/link";
import { btn, eyebrow } from "@/lib/ui";

/**
 * When the account could not be read.
 *
 * The raw error is not shown — a Prisma message names the host and the table, a
 * Clerk one names the deployment's configuration, and neither is a customer's to
 * see. Next has logged the real one on the server, which is where lib/auth's
 * `requireRole` also logs the "role could not be read" case that lands here on a
 * deployment with no DATABASE_URL.
 *
 * Sign out is offered beside "try again" because this is the one screen where
 * the fault may genuinely be the session: it is also where a refused staff
 * request is sent, and the fix for the wrong account is a different one.
 */
export default function AccountError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="paper-edge bg-paper">
      <span className={`${eyebrow} block border-b border-rule px-5 py-3`}>Something went wrong</span>
      <div className="flex flex-col items-start gap-4 px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="font-mono text-title text-ink">
          We couldn&rsquo;t load your account
        </h1>
        <p className="max-w-[50ch] font-sans text-body leading-relaxed text-steel">
          That is our end rather than yours, and nothing about your account or your
          orders has changed. Try again, or come back in a minute.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className={btn("primary", "md")}>
            Try again
          </button>
          <Link href="/orders" className={btn("secondary", "md")}>
            Your orders
          </Link>
        </div>
      </div>
    </div>
  );
}
