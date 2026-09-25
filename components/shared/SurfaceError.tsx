"use client";
import Link from "next/link";
import { sBtn, sCard } from "@/lib/shopUi";

export function SurfaceError({ reset }: { reset(): void }) {
  return (
    <section
      className={`${sCard} mx-auto my-10 max-w-3xl p-6 sm:p-10`}
      role="alert"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-s-berry">
        A brief interruption
      </p>
      <h1 className="text-3xl sm:text-4xl">We couldn’t load this page.</h1>
      <p className="my-5 max-w-prose text-sm leading-relaxed text-s-bark">
        Please try again. If you were placing an order, return to checkout and
        retry with the same details to recover your order confirmation.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={sBtn("primary")}>
          Try again
        </button>
        <Link href="/" className={sBtn("outline")}>
          Back to MakeYourCakes
        </Link>
      </div>
    </section>
  );
}
