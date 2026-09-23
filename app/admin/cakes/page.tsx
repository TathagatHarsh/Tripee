import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CakeCategory } from "@prisma/client";
import { CakeAvailability } from "@/components/admin/CakeAvailability";
import { FilterChips, SearchForm } from "@/components/admin/Filters";
import { Icon } from "@/components/admin/icons";
import {
  aBtn, aEyebrow, Card, CardHead, DataTable, EmptyState, Notice, PageHeader,
  Ref, StatusBadge, Td, Th, Tr,
} from "@/components/admin/ui";
import { listCakesForAdmin } from "@/lib/cakeData";
import {
  CAKE_CATEGORIES, categoryById, fromPricePaise, sellable, sizeName, sizesOffered,
  type CakeProductView,
} from "@/lib/cakes";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { formatINR, formatIST } from "@/lib/format";
import { hasImageStore, NO_IMAGE_STORE_MESSAGE } from "@/lib/storage";

/**
 * The cakes the shop sells.
 *
 * ## Why this page exists beside /admin/catalog
 *
 * Because they manage two different things and one of them had no page at all.
 * /admin/catalog is the 3D builder's parts list — what a filling costs, what a
 * finish costs in labour — and until now it was also, misleadingly, the only
 * thing called "Cakes" in this portal. The cakes a customer actually buys were
 * twenty-one constants in `lib/presets.ts`, and repricing one meant a
 * developer and a deploy. This is where they live now.
 *
 * The catalogue pages are untouched and still reachable: the builder's pricing
 * is real infrastructure and old orders were written against it. What changed
 * is the sidebar — see lib/adminNav, where "Cakes" now points here and the
 * option groups are named for what they are.
 *
 * ## Why a table and not a grid of cards
 *
 * A card grid is what the customer's shop already is, and this is not that job.
 * An owner opening this page is answering "which of these is off", "what does
 * that one cost now", "did the photo I uploaded land" — questions about a
 * column, read down. The photograph is still there, at 48px, because a cake
 * with no picture is the single most common thing to be looking for.
 *
 * The phone view is a card list, because a six-column table on 375px is a
 * horizontal scrollbar pretending to be a table.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cakes — Admin",
  robots: { index: false, follow: false },
};

export default async function CakesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const { q, category, status } = await searchParams;
  const query = (q ?? "").trim();

  const categoryId = CAKE_CATEGORIES.find((c) => c.id === category)?.id;
  const available = status === "on" ? true : status === "off" ? false : undefined;

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="The cake collection." blurb="The cakes the shop sells." />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const cakes = await listCakesForAdmin({ q: query, category: categoryId, available });

  /* Counts for the chips come from the same query with the status filter
     dropped, so "12 on the shelf" cannot disagree with what clicking it shows. */
  const all = await listCakesForAdmin({ q: query, category: categoryId });
  const on = all.filter((c) => c.isAvailable).length;

  const chip = (value: string | undefined, label: string, count: number) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (categoryId) next.set("category", categoryId);
    if (value) next.set("status", value);
    const qs = next.toString();
    return {
      label,
      count,
      href: qs ? `/admin/cakes?${qs}` : "/admin/cakes",
      active: (status ?? "") === (value ?? ""),
    };
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="The cake collection."
        blurb="Your storefront starts here. Manage photographs, recipes, variants and availability."
      >
        <Link href="/admin/cakes/new" className={aBtn("primary", "md")}>
          <Icon name="plus" size={15} />
          Add cake
        </Link>
      </PageHeader>

      {!hasImageStore() && <Notice tone="warn">{NO_IMAGE_STORE_MESSAGE}</Notice>}

      <div className="flex flex-col gap-3">
        <SearchForm
          action="/admin/cakes"
          value={query}
          label="Search cakes by name or description"
          placeholder="Search cakes…"
          keep={{ category: categoryId, status }}
        />

        <FilterChips
          label="Filter by shelf"
          chips={[
            chip(undefined, "All", all.length),
            chip("on", "On the shelf", on),
            chip("off", "Off the shelf", all.length - on),
          ]}
        />

        <FilterChips
          label="Filter by category"
          chips={[
            {
              label: "Every category",
              href: hrefFor({ q: query, status }),
              active: !categoryId,
            },
            ...CAKE_CATEGORIES.map((c) => ({
              label: c.name,
              href: hrefFor({ q: query, status, category: c.id }),
              active: categoryId === c.id,
            })),
          ]}
        />
      </div>

      <Card flush>
        <CardHead
          title={`${cakes.length} ${cakes.length === 1 ? "cake" : "cakes"}`}
          note="Lowest display order first. Click a row to edit everything about it."
        />

        {cakes.length === 0 ? (
          <EmptyState
            icon="cake"
            title={all.length === 0 && !query ? "No cakes yet" : "Nothing matches"}
            blurb={
              all.length === 0 && !query
                ? "The shop is empty until there is a cake in it. Add one, or run the seed to bring in the twenty-one the site shipped with."
                : "No cake matches those filters."
            }
          >
            {all.length === 0 && !query ? (
              <Link href="/admin/cakes/new" className={aBtn("primary", "md")}>
                Add the first cake
              </Link>
            ) : (
              <Link href="/admin/cakes" className={aBtn("secondary", "md")}>
                Clear filters
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            {/* ── Table, from 768px up ─────────────────────────────────── */}
            <div className="hidden md:block">
              <DataTable
                caption="Every cake the shop sells"
                minWidth="60rem"
                head={
                  <>
                    <Th>Cake</Th>
                    <Th>Category</Th>
                    <Th align="right">From</Th>
                    <Th>Versions</Th>
                    <Th>Shelf</Th>
                    <Th>Updated</Th>
                    <Th><span className="sr-only">Edit</span></Th>
                  </>
                }
              >
                {cakes.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb url={c.imageUrl} name={c.name} />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/cakes/${c.id}`}
                            className="font-medium text-a-ink transition-colors hover:text-a-accent-ink"
                          >
                            {c.name}
                          </Link>
                          {c.isFeatured && (
                            <StatusBadge label="Featured" tone="accent" dot={false} className="ml-2" />
                          )}
                          <Ref className="mt-0.5 block text-a-muted">/cakes/{c.slug}</Ref>
                        </div>
                      </div>
                    </Td>
                    <Td>{categoryById(c.category).name}</Td>
                    <Td align="right">
                      {/* The cheapest version on sale — the figure the card
                          prints. A cake with nothing priced says so, because a
                          blank cell reads as a rendering fault. */}
                      <span className="font-a-mono tabular-nums">
                        {fromPricePaise(c) === null ? "—" : formatINR(fromPricePaise(c)!)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-a-muted">{versionsLine(c)}</span>
                    </Td>
                    <Td>
                      <CakeAvailability id={c.id} name={c.name} available={c.isAvailable} />
                      {!c.productionSpec && <p className="mt-2 text-xs">Sales blocked · {c.productionIssues?.[0] ?? "Missing production specification"}</p>}
                    </Td>
                    <Td>
                      <span className="text-a-muted">{formatIST(new Date(c.updatedAt))}</span>
                    </Td>
                    <Td align="right">
                      <Link href={`/admin/cakes/${c.id}`} className={aBtn("ghost", "sm")}>
                        <Icon name="edit" size={14} />
                        Edit
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </div>

            {/* ── Cards, below 768px ───────────────────────────────────── */}
            <ul className="flex flex-col md:hidden">
              {cakes.map((c) => (
                <li key={c.id} className="border-b border-a-line p-4 last:border-0">
                  <div className="flex gap-3">
                    <Thumb url={c.imageUrl} name={c.name} large />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Link
                        href={`/admin/cakes/${c.id}`}
                        className="font-a-sans text-a-item font-semibold text-a-ink"
                      >
                        {c.name}
                      </Link>
                      <span className={aEyebrow}>
                        {categoryById(c.category).name} · {versionsLine(c)}
                      </span>
                      <span className="font-a-mono text-a-body tabular-nums">
                        {fromPricePaise(c) === null ? "No price set" : `from ${formatINR(fromPricePaise(c)!)}`}
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <CakeAvailability id={c.id} name={c.name} available={c.isAvailable} />
                      {!c.productionSpec && <p className="mt-2 text-xs">Sales blocked · {c.productionIssues?.[0] ?? "Missing production specification"}</p>}
                        {c.isFeatured && <StatusBadge label="Featured" tone="accent" dot={false} />}
                      </div>
                    </div>
                  </div>
                  <Link href={`/admin/cakes/${c.id}`} className={aBtn("secondary", "md", "mt-3 w-full")}>
                    Edit cake
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function hrefFor({
  q,
  status,
  category,
}: {
  q?: string;
  status?: string;
  category?: CakeCategory;
}): string {
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  if (category) next.set("category", category);
  if (status) next.set("status", status);
  const qs = next.toString();
  return qs ? `/admin/cakes?${qs}` : "/admin/cakes";
}

/**
 * The photograph, small, or a plain marker that there isn't one.
 *
 * Not `components/shop/CakePhoto` — that draws a cake, which is right on a
 * storefront where the picture is the product and wrong in a table where the
 * owner's question is "has this one got a photo yet". A drawn cake would answer
 * that question with something that looks like a yes.
 */
function Thumb({ url, name, large = false }: { url: string | null; name: string; large?: boolean }) {
  const size = large ? "size-16" : "size-11";
  if (!url) {
    return (
      <span
        aria-label="No photo"
        title="No photo"
        className={`flex ${size} shrink-0 items-center justify-center rounded-a-sm border border-dashed border-a-line-strong bg-a-sunken text-a-faint`}
      >
        <Icon name="image" size={large ? 20 : 15} />
      </span>
    );
  }
  return (
    <span className={`relative ${size} shrink-0 overflow-hidden rounded-a-sm border border-a-line`}>
      <Image
        src={url}
        alt={`Photo of ${name}`}
        fill
        sizes={large ? "64px" : "44px"}
        className="object-cover"
      />
    </span>
  );
}

/**
 * "1.5 kg · egg & eggless", or "4 sizes · eggless", in one cell.
 *
 * What an owner needs at a glance is whether a cake has versions and roughly
 * which — the exact grid is one click away in the editor, and printing twelve
 * cells into a table row would make every row four lines tall. Sizes are named
 * when there is one and counted when there are several, the same rule the
 * customer's card follows.
 *
 * A cake with no priced version says so out loud rather than rendering an empty
 * cell: it is not on sale however green its shelf toggle looks, and that is
 * exactly the state somebody scanning this table needs to spot.
 */
function versionsLine(cake: CakeProductView): string {
  const live = sellable(cake);
  if (live.length === 0) return "Nothing priced";

  const sizes = sizesOffered(cake);
  const size = sizes.length === 1 ? sizeName(sizes[0]) : `${sizes.length} sizes`;

  const egg = live.some((v) => v.eggType === "egg");
  const eggless = live.some((v) => v.eggType === "eggless");
  const sponge = egg && eggless ? "egg & eggless" : egg ? "egg" : "eggless";

  return `${size} · ${sponge}`;
}
