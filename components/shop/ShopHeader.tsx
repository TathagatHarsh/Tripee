import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { CartBadge } from "@/components/shop/CartBadge";
import { CAKE_CATEGORIES } from "@/lib/cakes";
import { sField } from "@/lib/shopUi";

/**
 * The shop's bar: wordmark, categories, search, account, cart.
 *
 * ## Why the mobile menu needs no JavaScript
 *
 * The bar is `sticky … backdrop-blur-md`, and a `backdrop-filter` makes an
 * element both a containing block and a stacking context — so an absolutely
 * positioned panel inside it resolves against the header's own padding box and
 * cannot lift above the bar it hangs off. components/AccountMenu carries the
 * full version of that note; the conclusion is the same here and so is the fix:
 * `popover="auto"` renders in the top layer, whose containing block is the
 * viewport.
 *
 * The difference is that this one is *declarative*. `popovertarget` on a button
 * and `popover` on the panel is pure HTML — light dismiss, Escape, and focus
 * return all come from the platform — so unlike the account menu there is no
 * `aria-expanded` mirror to keep and therefore no state, no hook and no
 * `"use client"`. A navigation drawer that ships zero bytes of JavaScript is
 * the whole reason to reach for the platform control.
 *
 * ## Why the search is a GET form
 *
 * `/shop?q=chocolate` is a place: bookmarkable, shareable, reachable with the
 * back button, and rendered on the server. A search held in component state is
 * none of those, and would also mean shipping the catalogue to the browser to
 * filter it.
 */
export function ShopHeader({
  /** Which nav item to mark as current, if any. */
  current,
}: {
  current?: "shop" | "orders" | string;
} = {}) {
  /* `s-bar` deepens the ground and drops a shadow over the first 120px of
     document scroll, on a native `scroll()` timeline; see globals.css. It is the
     one thing the bar can tell you that the page below it cannot: you are no
     longer at the top. Zero JavaScript, and it collapses under
     prefers-reduced-motion with every other animation in the document. */
  return (
    <header className="s-bar sticky top-0 z-30 border-b border-s-line bg-s-cream/90 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[84rem] items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:px-10">
        {/* The drawer's trigger. First in the DOM so it is the first tab stop on
            a phone, where it is the only navigation there is. */}
        <button
          type="button"
          popoverTarget="shop-drawer"
          aria-label="Browse cakes"
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-s-sm text-s-cocoa transition-colors duration-[var(--dur-ui)] hover:bg-s-cream-deep lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden focusable="false">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <Link
          href="/"
          aria-label="Makemycake, home"
          className="flex shrink-0 items-center gap-2 text-s-cocoa"
        >
          <CakeWordmark />
          <span className="font-display text-[1.375rem] leading-none tracking-[-0.01em] whitespace-nowrap">
            Makemycake
          </span>
        </Link>

        <nav aria-label="Cakes" className="ml-4 hidden items-center gap-1 lg:flex">
          <NavLink href="/shop" current={current === "shop"}>All cakes</NavLink>
          {/* Four of the six, because the bar has room for four. The rest are on
              /shop, which is where the sixth link would send somebody anyway. */}
          {CAKE_CATEGORIES.slice(0, 4).map((c) => (
            <NavLink key={c.slug} href={`/shop?category=${c.slug}`} current={current === c.slug}>
              {c.name.replace(/ Cakes$/, "")}
            </NavLink>
          ))}
        </nav>

        {/* `flex-1 justify-end` rather than `ml-auto` on the first control: the
            search field has to be the thing that takes the slack, or it is a
            fixed 14rem box with a hole beside it on a wide screen. */}
        <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
          <form action="/shop" role="search" className="hidden max-w-[18rem] flex-1 md:block">
            <label htmlFor="shop-search" className="sr-only">
              Search cakes
            </label>
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                focusable="false"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-s-bark"
              >
                <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.6" />
                <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                id="shop-search"
                type="search"
                name="q"
                placeholder="Search cakes"
                className={sField("h-11 pl-9 text-[0.875rem]")}
              />
            </div>
          </form>

          <AccountMenu tone="shop" />
          <CartBadge />
        </div>
      </div>

      {/*
        The drawer. In the top layer, so it is above the blurred bar rather than
        clipped by it, and `inset-0 … m-0` because a popover's UA stylesheet
        centres it — without the reset this arrives as a floating box in the
        middle of the screen instead of a panel down the side.
      */}
      <div
        id="shop-drawer"
        popover="auto"
        className={
          "fixed inset-y-0 left-0 right-auto m-0 h-dvh w-[min(20rem,86vw)] " +
          "overflow-y-auto border-r border-s-line bg-s-cream p-5 text-s-cocoa " +
          "backdrop:bg-s-cocoa/35 " +
          "open:motion-safe:animate-[a-drawer-in_220ms_var(--ease-out)] lg:hidden"
        }
      >
        <div className="mb-5 flex items-center justify-between">
          <span className="font-display text-[1.25rem]">Browse</span>
          <button
            type="button"
            popoverTarget="shop-drawer"
            popoverTargetAction="hide"
            aria-label="Close menu"
            className="inline-flex size-11 items-center justify-center rounded-s-sm hover:bg-s-cream-deep"
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden focusable="false">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form action="/shop" role="search" className="mb-5">
          <label htmlFor="shop-search-mobile" className="sr-only">
            Search cakes
          </label>
          <input
            id="shop-search-mobile"
            type="search"
            name="q"
            placeholder="Search cakes"
            className={sField("h-12")}
          />
        </form>

        <nav aria-label="Cakes">
          <ul className="flex flex-col">
            <li>
              <DrawerLink href="/shop">All cakes</DrawerLink>
            </li>
            {CAKE_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <DrawerLink href={`/shop?category=${c.slug}`}>{c.name}</DrawerLink>
              </li>
            ))}
            <li className="mt-2 border-t border-s-line pt-2">
              <DrawerLink href="/cart">Cart</DrawerLink>
            </li>
            <li>
              <DrawerLink href="/orders">My orders</DrawerLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={[
        "inline-flex min-h-11 items-center rounded-s-sm px-3 text-[0.9375rem] whitespace-nowrap",
        "transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)]",
        current ? "bg-s-cream-deep text-s-cocoa" : "text-s-bark hover:bg-s-cream-deep hover:text-s-cocoa",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

/* Closing on navigation is the platform's job here and not ours: these are
   client-side route changes, and a popover cannot see one — but the drawer is
   `lg:hidden` and every link leaves the page, which unmounts it. The account
   menu has to close by hand because it stays mounted across the same hop. */
function DrawerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center rounded-s-sm px-3 text-[1rem] text-s-cocoa transition-colors hover:bg-s-cream-deep"
    >
      {children}
    </Link>
  );
}

/**
 * The wordmark's mark: a cake in three strokes.
 *
 * Not to be confused with `components/orders/CakeMark`, which draws a specific
 * customer's cake from its configuration. This one is the logo and knows
 * nothing about any order.
 */
function CakeWordmark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-s-berry" aria-hidden focusable="false">
      <path d="M12 2.6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M4.5 20.4V12a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4.5 14.6c1.9 0 1.9 1.6 3.75 1.6s1.9-1.6 3.75-1.6 1.9 1.6 3.75 1.6 1.9-1.6 3.75-1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3 20.4h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
