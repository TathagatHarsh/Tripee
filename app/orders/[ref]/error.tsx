"use client";

import Link from "next/link";
import { btn, eyebrow } from "@/lib/ui";

/**
 * When this one order could not be read.
 *
 * Separate from the list's boundary next door, because the two failures have
 * different recoveries: a list that will not load leaves somebody with nowhere
 * to go, while one order that will not load still has the list — and the list is
 * where the reference they need is printed.
 *
 * The raw error is not shown, for the reasons app/orders/error.tsx sets out at
 * length. It is on the server, in the logs, with a stack.
 */
export default function OrderError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="paper-edge bg-paper">
      <span className={`${eyebrow} block border-b border-rule px-5 py-3`}>Something went wrong</span>
      <div className="flex flex-col items-start gap-4 px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="font-mono text-title text-ink">
          We couldn&rsquo;t load this order
        </h1>
        <p className="max-w-[50ch] font-sans text-body leading-relaxed text-steel">
          Your order itself is fine — this is only the page that shows it. Try
          again, or open it from the list.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className={btn("primary", "md")}>
            Try again
          </button>
          <Link href="/orders" className={btn("secondary", "md")}>
            All your orders
          </Link>
        </div>
      </div>
    </div>
  );
}
