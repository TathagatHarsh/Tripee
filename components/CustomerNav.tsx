import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

/**
 * The bar over the two customer areas: the account, and the orders.
 *
 * ## Nothing renders this today
 *
 * Phase 1's storefront redesign moved /orders and /account inside the shop's
 * own chrome, so both layouts now use `<ShopHeader>` and this has no call
 * sites. It is kept rather than deleted, deliberately and for one reason: the
 * argument below is still the right argument, and if the account area ever
 * needs a bar of its own again — a signed-in surface that is not part of the
 * shop — this is that bar, already built and already reasoned about.
 *
 * If you are reading this because you want a customer header, use
 * `components/shop/ShopHeader` instead. Two navigation systems for one
 * signed-in customer is the thing both files exist to avoid, and the shop's is
 * the one that can reach the whole shop.
 *
 * ## Why this is not the shopfront header, and not the account menu either
 *
 * The shopfront's bar (app/page.tsx) sells cakes — a wordmark, four sections,
 * the locality and one filled call to action — and it carries
 * `<AccountMenu>`, a popover holding the way *in*. Somebody already signed in
 * and reading their own orders needs the opposite: the two destinations they
 * actually move between, and the way out. Reusing the selling bar here would
 * put "How it works" above a delivery window.
 *
 * It is also not a second navigation system. `<AccountMenu>` stays the one
 * account control on the shopfront and is what brings people here; this is the
 * local bar of the area it brings them to, the way app/admin and app/kitchen
 * each have their own. Two links and a sign-out, at 44px, at every width.
 *
 * A server component with a `current` prop rather than `usePathname()`: both
 * pages know which one they are, and knowing it on the server keeps this out of
 * the client bundle entirely.
 */
export function CustomerNav({ current }: { current: "account" | "orders" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur-md">
      {/*
        One row on a tablet upwards, two on a phone — and the wrap is the design
        rather than a fallback.

        Measured at 375px: the wordmark is about 175px of tracked-out mono, the
        two tabs about 140px and "SIGN OUT" 87px, inside a 343px gutter-to-gutter
        box. All three on one line overflowed the viewport by 35px and put a
        horizontal scrollbar under every page in this area. The alternatives were
        to shrink the type below this system's 12px floor, or to hide the tabs on
        the width where they matter most.

        So `flex-wrap`, with the nav ordered last and full-width below `sm`: the
        wordmark and the way out take the first row, the two destinations take a
        ruled strip under it at the full 44px. Nothing is hidden at any width and
        nothing is smaller on a phone.
      */}
      <div className="mx-auto flex max-w-[64rem] flex-wrap items-center gap-x-2 px-4 sm:h-[68px] sm:gap-5 sm:px-8">
        <Link
          href="/"
          className="mr-auto inline-flex min-h-14 shrink-0 items-center font-mono text-item font-medium tracking-[0.2em] text-ink uppercase sm:min-h-11"
        >
          MakeYourCakes
        </Link>

        {/* `aria-label` because there are two navs on a page that also has the
            timeline's ordered lists — a screen reader's landmark list should say
            which one this is. */}
        <nav
          aria-label="Your account"
          className="flex items-center max-sm:order-last max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:border-t max-sm:border-rule max-sm:px-2"
        >
          <Tab href="/account" active={current === "account"}>
            Account
          </Tab>
          <Tab href="/orders" active={current === "orders"}>
            {/* "My orders" is the label on the shopfront's bar; inside the
                account area the word that disambiguates is "orders". */}
            <span className="max-sm:hidden">My&nbsp;</span>Orders
          </Tab>
        </nav>

        {/*
          Clerk's own control rather than a server action calling its API: it
          ends the session at Clerk as well as in this browser, which is the
          difference between a shared phone being signed out and merely looking
          signed out. The same component the account page and both staff headers
          use.
        */}
        <SignOutButton redirectUrl="/">
          <button
            type="button"
            className="inline-flex min-h-14 shrink-0 items-center px-2 font-mono text-micro tracking-[0.14em] text-steel uppercase transition-colors duration-[var(--dur-ui)] hover:text-ink sm:min-h-11 sm:px-3"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </header>
  );
}

/**
 * One destination. The current one is marked by a rule under it rather than by a
 * filled pill — §1.4 gives this system no radius and emphasis here comes from
 * case, colour and rule, which is also what keeps the bar from growing 8px of
 * chrome on the page you are already on.
 */
function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex min-h-11 items-center border-b-2 px-2.5 font-mono text-micro",
        "tracking-[0.14em] uppercase transition-colors duration-[var(--dur-ui)] sm:px-3.5",
        active
          ? "border-ink text-ink"
          : "border-transparent text-steel hover:text-ink",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
