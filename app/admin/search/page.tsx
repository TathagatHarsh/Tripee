import Link from "next/link";
import type { Metadata } from "next";
import { optionHref } from "@/lib/adminNav";
import { CATEGORY_META } from "@/lib/adminNav";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR, formatIST, titleCase } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { SearchForm } from "@/components/admin/Filters";
import {
  aBtn, AvailabilityBadge, Card, CardHead, EmptyState, Notice, OrderStatusBadge,
  PageHeader, Ref,
} from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

/**
 * The global search, and the reason it exists rather than being a decorative
 * box in the header.
 *
 * §27 asks for a global search "if practical" and is explicit that a fake
 * search UI is worse than none: "Only show it if it actually works." So this is
 * a real page over the two things in this database that have names in them.
 *
 * **Orders**, by reference, customer name and phone number — which is also how
 * "customers" are searched, because there is no customer table. A person who
 * has ordered is `Order.customerName` and `Order.customerPhone` on their
 * orders; `UserProfile` holds a role and a display name and is deliberately not
 * searched here, since it exists to answer "what may this account do" rather
 * than "who bought a cake" (a guest order has no profile at all, and those are
 * first-class orders — see the note on `Order.userId`).
 *
 * **Catalogue options**, by name and description. All ten categories at once,
 * so "chocolate" finds the sponge, the ganache, the shards and the curls
 * without anybody choosing a category first.
 *
 * What is honestly *not* searchable, and is said so on the page rather than
 * silently missing: the twenty-one named cakes. They are `lib/presets.ts` —
 * code, not rows — so there is nothing to query. Pretending otherwise by
 * grepping a constant at request time would produce results an owner then
 * cannot click through to edit, which is the fake search §27 is about.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search — Admin",
  robots: { index: false, follow: false },
};

/** Long enough to be a search rather than a table scan. */
const MIN_TERM = 2;

export default async function AdminSearch({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  const header = (
    <>
      <PageHeader
        title="Search"
        blurb="Orders, customers and the catalogue, all at once."
        back={{ href: "/admin", label: "Back to dashboard" }}
      />
      <SearchForm
        action="/admin/search"
        value={term}
        label="Search orders, customers and the catalogue"
        placeholder="A reference, a name, a phone number, or a cake option"
      />
    </>
  );

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  if (term.length < MIN_TERM) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Card flush>
          <EmptyState
            icon="search"
            title={term.length === 0 ? "What are you looking for?" : "Keep typing."}
            blurb={
              term.length === 0
                ? "Search by order reference, a customer's name or number, or the name of anything in the catalogue."
                : `Two characters at least — a single letter would match most of the book.`
            }
          />
        </Card>
      </div>
    );
  }

  const [orders, options] = await Promise.all([
    db.order.findMany({
      where: {
        OR: [
          { ref: { contains: term, mode: "insensitive" } },
          { customerName: { contains: term, mode: "insensitive" } },
          { customerPhone: { contains: term } },
          /*
           * The bakery making it. Matched through the *live* assignment rather
           * than through `assignments` at large, so searching "Sweet Crust"
           * finds what they are making now and not every order they were once
           * offered and declined — which is the question somebody typing a
           * bakery's name into a search box is asking.
           *
           * Still one query. This is a join in Postgres, not a second read
           * filtered in the page.
           */
          { currentAssignment: { vendor: { name: { contains: term, mode: "insensitive" } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        ref: true, status: true, customerName: true, customerPhone: true,
        totalPaise: true, createdAt: true,
        currentAssignment: { select: { vendor: { select: { name: true } } } },
      },
    }),
    db.catalogOption.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { blurb: { contains: term, mode: "insensitive" } },
        ],
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      take: 30,
      select: {
        id: true, category: true, value: true, name: true, blurb: true,
        priceInputPaise: true, isAvailable: true,
      },
    }),
  ]);

  const total = orders.length + options.length;

  return (
    <div className="flex flex-col gap-5">
      {header}

      <p className="text-a-small text-a-muted">
        <span className="font-semibold text-a-ink">{total}</span>{" "}
        {total === 1 ? "result" : "results"} for “{term}” —{" "}
        {orders.length} {orders.length === 1 ? "order" : "orders"} and{" "}
        {options.length} catalogue {options.length === 1 ? "option" : "options"}.
      </p>

      {total === 0 && (
        <Card flush>
          <EmptyState
            icon="search"
            title={`Nothing matches “${term}”.`}
            blurb={
              "Orders are searched by reference, customer name, phone number and "
              + "the bakery currently making them; "
              + "the catalogue by name and description. The twenty-one named cakes — "
              + "Chocolate Truffle, Red Velvet and the rest — are built into the "
              + "product rather than stored, so they are not in here."
            }
          >
            <Link href="/admin/orders" className={aBtn("secondary", "md")}>
              Browse all orders
            </Link>
            <Link href="/admin/catalog" className={aBtn("secondary", "md")}>
              Browse the catalogue
            </Link>
          </EmptyState>
        </Card>
      )}

      {orders.length > 0 && (
        <Card flush>
          <CardHead
            title="Orders and customers"
            note="Matched on the reference, the name, the phone number, or the bakery."
          >
            <Link href={`/admin/orders?q=${encodeURIComponent(term)}`} className={aBtn("ghost", "sm")}>
              Open in the orders table
              <Icon name="chevronRight" size={13} />
            </Link>
          </CardHead>
          <ul className="flex flex-col">
            {orders.map((o) => (
              <li key={o.ref} className="border-b border-a-line last:border-0">
                <Link
                  href={`/admin/orders/${o.ref}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-a-sunken sm:px-5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Ref className="font-semibold text-a-ink">{o.ref}</Ref>
                      <OrderStatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                    </span>
                    <span className="text-a-meta text-a-muted">
                      {o.customerName ?? "No name taken"}
                      {o.customerPhone && ` · ${o.customerPhone}`}
                      {` · ${formatIST(o.createdAt)}`}
                      {/* Printed so a match on a bakery's name is visibly a
                          match rather than a row that appears for no reason. */}
                      {o.currentAssignment && ` · ${o.currentAssignment.vendor.name}`}
                    </span>
                  </span>
                  <span className="font-a-mono text-a-small font-semibold tabular-nums">
                    {formatINR(o.totalPaise)}
                  </span>
                  <Icon name="chevronRight" size={15} className="shrink-0 text-a-ghost" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {options.length > 0 && (
        <Card flush>
          <CardHead
            title="Catalogue"
            note="Every category at once — sponges, fillings, frostings, toppings, sizes, shapes and the rest."
          />
          <ul className="flex flex-col">
            {options.map((o) => (
              <li key={o.id} className="border-b border-a-line last:border-0">
                <Link
                  href={optionHref(o.category, o.value)}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-a-sunken sm:px-5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-a-sans text-a-item font-medium text-a-ink">
                        {o.name}
                      </span>
                      <span className="rounded-a-sm bg-a-idle-wash px-1.5 py-0.5 text-a-meta font-medium text-a-muted">
                        {CATEGORY_META[o.category].label}
                      </span>
                      <AvailabilityBadge available={o.isAvailable} />
                    </span>
                    <span className="max-w-2xl text-a-meta leading-snug text-a-muted">
                      {o.blurb}
                    </span>
                  </span>
                  <span className="font-a-mono text-a-small font-semibold tabular-nums">
                    {formatINR(o.priceInputPaise)}
                  </span>
                  <Icon name="chevronRight" size={15} className="shrink-0 text-a-ghost" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {total > 0 && (
        <Notice tone="accent" icon="info">
          The named cakes on the shop&rsquo;s catalogue page — {titleCase("chocolate-truffle")},
          Red Velvet and nineteen others — are built into the product rather than
          stored, so they are not searchable here. Their prices come from the
          options above: repricing a sponge or a frosting changes what every cake
          using it costs.
        </Notice>
      )}
    </div>
  );
}
