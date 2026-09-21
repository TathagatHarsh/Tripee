"use client";

import Link from "next/link";
import { useCartCount, useCartHydrated } from "@/lib/cart";
import { sIconBtn } from "@/lib/shopUi";

/**
 * The cart control in the header, and the count on it.
 *
 * The count is gated on `useCartHydrated()` rather than rendered straight from
 * the store, and that gate is load-bearing: the cart persists to localStorage
 * with `skipHydration`, so the server renders "no badge" and the browser would
 * render "3" on the very first client pass. That is a hydration mismatch in a
 * component sitting inside every page's header, which React resolves by
 * throwing the whole subtree away and re-rendering it — the header flickers and
 * the console fills. Waiting one tick for storage costs nothing anybody can see.
 */
export function CartBadge() {
  const hydrated = useCartHydrated();
  const count = useCartCount();
  const showing = hydrated && count > 0;

  return (
    <Link
      href="/cart"
      className={sIconBtn("border border-s-line-strong bg-s-shell hover:border-s-cocoa")}
      /* The glyph says nothing to a screen reader, and the count is the thing
         somebody actually wants read out. `aria-live` is deliberately absent —
         this is not an alert, and announcing it on every add would talk over
         the confirmation the add button already gives. */
      aria-label={showing ? `Cart, ${count} ${count === 1 ? "cake" : "cakes"}` : "Cart, empty"}
    >
      <BagGlyph />
      {showing && (
        <span
          aria-hidden
          /*
            `key={count}` is the whole animation.

            React tears the old span down and mounts a new one whenever the
            number changes, so the CSS animation on `s-pop` restarts by itself.
            No effect, no timer to clear, no `useState` mirroring a value the
            store already holds — the three things a "replay this animation on
            change" helper usually costs.

            It also fires on the first paint after hydration, which is wanted
            rather than tolerated: the badge does not exist until the cart is
            read from storage, so its arrival is the moment somebody should be
            told there are cakes waiting.
          */
          key={count}
          className={
            "s-pop absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center " +
            "rounded-full bg-s-berry px-1.5 py-0.5 font-mono text-[0.625rem] " +
            "leading-none font-medium text-white tabular-nums"
          }
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function BagGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden focusable="false">
      <path
        d="M5.4 8h13.2l-1 11.2a1.8 1.8 0 0 1-1.8 1.6H8.2a1.8 1.8 0 0 1-1.8-1.6L5.4 8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 10.5V7a3 3 0 0 1 6 0v3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
