import Link from "next/link";
import type { Metadata } from "next";
import { EmptyOrders } from "@/components/orders/EmptyOrders";
import { OrderCard } from "@/components/orders/OrderCard";
import { requireRole } from "@/lib/auth";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import type { OrderPhase } from "@/lib/orders";
import { sBtn, sCard, sEyebrow, sField } from "@/lib/shopUi";
import { countByPhase, listOrders } from "./data";

/**
 * Every order on this account.
 *
 * ## Its own area, not a panel inside the account
 *
 * The order history used to be a section of /account, under the greeting and the
 * staff-portal box, as a list of four-column rows. That is the wrong shape for
 * the thing a returning customer comes back for: they are not here to manage an
 * account, they are here to find out where the cake is. So orders are a
 * top-level area with their own URL, their own search and their own tabs, and
 * /account is what it says on the tin.
 *
 * ## Why the search and the tabs need no JavaScript
 *
 * The search is a `GET` form and each tab is a link. That is not minimalism for
 * its own sake — it is what makes a filtered list a *place*: `?show=active` can
 * be bookmarked, shared with the bakery over the phone, opened in a second tab
 * and reached with the back button, none of which is true of a filter held in
 * component state. It also means the filtering happens in Postgres over an
 * indexed `userId` rather than by shipping every order to the browser and hiding
 * some of them.
 *
 * The authorisation is `requireRole` here and the `userId` clause in
 * app/orders/data.ts — never the rendering. See that file.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your orders · MakeYourCakes",
  /* Somebody's order history is not for a search index, and neither is the
     shape of this page. Same stance as /account. */
  robots: { index: false, follow: false },
};

/**
 * The tabs, in the order an order moves through them.
 *
 * Keyed by the phases lib/orders' PHASE table already sorts every status into,
 * so a status added to the enum lands in a tab rather than falling out of the
 * list — and a tab cannot exist that no status can reach.
 */
const TABS: { key: OrderPhase | "all"; label: string }[] = [
  { key: "all", label: "All orders" },
  { key: "active", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

function tabFor(raw: string | undefined): OrderPhase | undefined {
  return TABS.some((t) => t.key === raw && t.key !== "all")
    ? (raw as OrderPhase)
    : undefined;
}

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  // First statement, and never inside a try: this refuses by throwing.
  const { profile } = await requireRole("CUSTOMER");

  const { q, show } = await searchParams;
  const query = q?.trim() ?? "";
  const phase = tabFor(show);

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className={sEyebrow}>Orders</span>
        <h1 className="text-[2.25rem] sm:text-[2.75rem]">Your orders</h1>
      </div>

      {!hasDatabase() ? (
        /* The documented state of a preview deployment. Said plainly rather than
           shown as an empty list, which would read as "you have never ordered
           anything" and be false. */
        <p className={`${sCard} px-5 py-4 leading-relaxed text-s-bark`}>
          {NO_DATABASE_MESSAGE}
        </p>
      ) : (
        <OrderList userId={profile.id} query={query} phase={phase} show={show} />
      )}
    </>
  );
}

/**
 * The list, the search and the tabs, once the deployment has a database.
 *
 * Split out so the counts and the rows are fetched in one place and the page
 * above stays readable. Three queries in parallel: the page of orders, the
 * counts behind the tabs, and the catalogue the cards name their cakes from.
 */
async function OrderList({
  userId,
  query,
  phase,
  show,
}: {
  userId: string;
  query: string;
  phase: OrderPhase | undefined;
  show: string | undefined;
}) {
  const [orders, counts, catalog] = await Promise.all([
    listOrders(userId, { q: query, phase }),
    countByPhase(userId),
    getCatalogSnapshot(),
  ]);

  return (
    <>
      <div className="flex flex-col gap-4">
        {/*
          A plain GET form: no client component, no state, and the URL it
          produces is the one the tabs below already speak. `role="search"` so a
          screen reader can jump straight to it.
        */}
        <form
          action="/orders"
          role="search"
          className="flex flex-wrap items-stretch gap-2"
        >
          {/* The tab rides along, so searching does not silently drop somebody
              from "In progress" back into everything. */}
          {show && <input type="hidden" name="show" value={show} />}

          <label htmlFor="q" className="sr-only">
            Search your orders by reference or flavour
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search by reference or flavour"
            enterKeyHint="search"
            className={sField("min-w-0 flex-1 sm:max-w-[24rem]")}
          />
          <button type="submit" className={sBtn("dark", "md", "gap-2")}>
            <SearchGlyph />
            Search
          </button>
          {query && (
            <Link
              href={show ? `/orders?show=${show}` : "/orders"}
              className="inline-flex min-h-11 shrink-0 items-center px-3 text-[0.875rem] text-s-bark transition-colors hover:text-s-cocoa"
            >
              Clear
            </Link>
          )}
        </form>

        {/*
          Tabs, as links. A tab is drawn only where a status can put an order
          behind it — an empty "Cancelled" tab on an account that has never had
          one is a filter for nothing. "All orders" is always there, so there is
          never a page with no way back to everything.
        */}
        <nav aria-label="Filter orders" className="flex flex-wrap items-center gap-x-1 border-b border-s-line">
          {TABS.filter((t) => t.key === "all" || counts[t.key] > 0).map((t) => {
            const active = t.key === "all" ? !phase : phase === t.key;
            const href = [
              "/orders",
              [
                t.key === "all" ? null : `show=${t.key}`,
                query ? `q=${encodeURIComponent(query)}` : null,
              ].filter(Boolean).join("&"),
            ].filter(Boolean).join("?");

            return (
              <Link
                key={t.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3",
                  "font-mono text-[0.6875rem] tracking-[0.13em] uppercase",
                  "transition-colors duration-[var(--dur-ui)]",
                  active
                    ? "border-s-berry text-s-berry"
                    : "border-transparent text-s-bark hover:text-s-cocoa",
                ].join(" ")}
              >
                {t.label}
                <span
                  className={[
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5",
                    "text-[0.625rem] leading-none tabular-nums",
                    active ? "bg-s-berry-wash text-s-berry" : "bg-s-cream-deep text-s-bark",
                  ].join(" ")}
                >
                  {counts[t.key]}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {orders.length === 0 ? (
        <EmptyOrders
          reason={query ? "search" : phase ? "filter" : "none"}
          query={query}
        />
      ) : (
        /* Each card on its own view() timeline, so a long history arrives as
           you scroll it rather than as one wall. See globals.css. */
        <ul className="s-rise-row flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.ref} order={order} catalog={catalog} />
          ))}
        </ul>
      )}
    </>
  );
}

/** Two shapes' worth of path data. There is no icon library in this repository. */
function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20 20" />
    </svg>
  );
}
