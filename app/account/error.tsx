"use client";

import Link from "next/link";
import { sBtn, sCard } from "@/lib/shopUi";

/**
 * When the account could not be read.
 *
 * The raw error is not shown — a Prisma message names the host and the table, a
 * Clerk one names the deployment's configuration, and neither is a customer's to
 * see. Next has logged the real one on the server, which is where lib/auth's
 * `requireRole` also logs the "role could not be read" case that lands here on a
 * deployment with no DATABASE_URL.
 *
 * ## Where "sign out" went
 *
 * It used to be offered beside "try again", because this is the one screen where
 * the fault may genuinely be the session — it is also where a refused staff
 * request is sent, and the fix for the wrong account is a different one. It is
 * still offered, and now in exactly one place: the account menu in the shop's
 * header, which this boundary renders inside. A second sign-out control 200px
 * below the first is two answers to one question.
 */
export default function AccountError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={sCard}>
      <div className="flex flex-col items-start gap-4 px-6 py-10 sm:px-10">
        <h1 className="text-[1.75rem]">We couldn&rsquo;t load your account</h1>
        <p className="max-w-[52ch] leading-relaxed text-s-bark">
          That is our end rather than yours, and nothing about your account or your
          orders has changed. Try again, or come back in a minute.
        </p>
        <p className="max-w-[52ch] text-[0.875rem] leading-relaxed text-s-bark">
          If you meant to open a staff board and were sent here instead, the
          account you are signed in as does not open it. Sign out from the
          account menu at the top of this page and use the one that does.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className={sBtn("primary", "md")}>
            Try again
          </button>
          <Link href="/orders" className={sBtn("outline", "md")}>
            Your orders
          </Link>
        </div>
      </div>
    </div>
  );
}
