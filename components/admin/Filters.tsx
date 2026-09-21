import Link from "next/link";
import { aBtn, aField } from "./ui";
import { Icon } from "./icons";

/**
 * Search and filters, as links and a GET form.
 *
 * Not a client component, and that is the interesting decision. Every filter in
 * this portal is a URL — `?status=confirmed&days=7` — which buys four things a
 * controlled React filter panel does not: the state survives a reload, a
 * filtered view can be bookmarked and sent to somebody, the back button undoes
 * a filter, and none of it ships JavaScript. The storefront's own catalogue
 * page reached the same conclusion for the same reasons; see app/presets.
 *
 * The cost is a round trip per filter change. On a table of a hundred orders
 * rendered on the server that is a few dozen milliseconds, and it is the right
 * side of the trade for a page that is mostly read.
 */

/**
 * A search box scoped to the page it is on.
 *
 * `method="get"` and named inputs, so pressing Enter navigates to the same URL
 * a link would. The hidden inputs are what preserve the *other* filters through
 * a search — without them, searching inside "Last 7 days" silently drops back
 * to all time, which reads as the search having found extra results.
 */
export function SearchForm({
  action,
  value,
  placeholder,
  label,
  keep = {},
}: {
  /** Where the form submits. The current page, normally. */
  action: string;
  value: string;
  placeholder: string;
  /** The accessible label. Never rely on the placeholder for this. */
  label: string;
  /** Other active filters, carried through as hidden fields. */
  keep?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:min-w-72">
        <label htmlFor="q" className="sr-only">{label}</label>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-a-faint"
        >
          <Icon name="search" size={16} />
        </span>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={value}
          placeholder={placeholder}
          className={aField("pl-9")}
        />
      </div>

      {Object.entries(keep).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}

      <button type="submit" className={aBtn("secondary", "md")}>Search</button>

      {value && (
        <Link
          href={
            /* Clearing drops `q` and keeps everything else, which is what the
               word "clear" means next to a search box. */
            Object.entries(keep).filter(([, v]) => v).length
              ? `${action}?${new URLSearchParams(
                  Object.entries(keep).filter((e): e is [string, string] => Boolean(e[1])),
                ).toString()}`
              : action
          }
          className={aBtn("quiet", "md")}
        >
          Clear
        </Link>
      )}
    </form>
  );
}

export interface Chip {
  label: string;
  href: string;
  active: boolean;
  /** A count beside the label, where one is genuinely known. Never invented. */
  count?: number;
}

/**
 * One row of filter chips.
 *
 * `aria-current="page"` on the active one, which is the accessible half of the
 * highlight — a chip row where the current filter is only darker tells a screen
 * reader nothing about which view it is looking at.
 *
 * A `<nav>` with a label, because this is navigation: every chip is a link to a
 * different URL, not a control that mutates state.
 */
export function FilterChips({ label, chips }: { label: string; chips: Chip[] }) {
  return (
    /*
     * `min-w-0` is load-bearing and was missing.
     *
     * The chips are `w-max` inside a box with `overflow-x: auto`, which is the
     * right construction and does nothing on its own here: on a wide screen the
     * orders page puts two of these side by side in a `lg:flex-row`, and a flex
     * item's `min-width` defaults to `auto` — so the nav grew to its content
     * instead of scrolling, and pushed the whole document 200px past the
     * viewport. Exactly the horizontal page overflow §33 forbids, and invisible
     * until measured: the page looks fine, the scrollbar appears at the bottom
     * of the window.
     */
    <nav aria-label={label} className="a-scroll-x -mx-1 min-w-0 px-1">
      <ul className="flex w-max min-w-full gap-1.5">
        {chips.map((c) => (
          <li key={c.href + c.label}>
            <Link
              href={c.href}
              aria-current={c.active ? "page" : undefined}
              className={[
                "inline-flex min-h-9 items-center gap-1.5 rounded-a border px-2.5",
                "font-a-sans text-a-small font-medium whitespace-nowrap",
                "transition-colors duration-[var(--dur-ui)]",
                c.active
                  ? "border-a-nav bg-a-nav text-a-nav-ink"
                  : "border-a-line bg-a-surface text-a-muted hover:border-a-line-strong hover:text-a-ink",
              ].join(" ")}
            >
              {c.label}
              {c.count !== undefined && (
                <span
                  className={[
                    "rounded-full px-1.5 text-a-meta tabular-nums",
                    c.active ? "bg-white/15 text-a-nav-ink" : "bg-a-idle-wash text-a-faint",
                  ].join(" ")}
                >
                  {c.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The header's search, pointing at /admin/search.
 *
 * §27 says a global search must not be a fake UI — only show it if it actually
 * works — so this exists because /admin/search is a real page that queries the
 * orders table and the catalogue and shows what it found. It searches those two
 * because those are the two things in this database with names in them:
 * "customers" are `Order.customerName` and `Order.customerPhone` and so are
 * found by searching orders, and the twenty-one named cakes are code rather
 * than rows and so are honestly not searchable here.
 *
 * Collapses to an icon-sized field on a phone rather than disappearing: the
 * header has a hamburger, a wordmark, a bell and an avatar on it already, and
 * the search is the one of the five that is worth the width.
 */
export function GlobalSearch({ value = "" }: { value?: string }) {
  return (
    <form method="get" action="/admin/search" className="min-w-0 flex-1 sm:max-w-xs">
      <label htmlFor="global-q" className="sr-only">
        Search orders, customers and the catalogue
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-a-faint"
        >
          <Icon name="search" size={16} />
        </span>
        <input
          id="global-q"
          name="q"
          type="search"
          defaultValue={value}
          placeholder="Search orders, customers, catalogue"
          className={aField("h-10 py-0 pl-8.5 text-a-small placeholder:text-a-faint")}
        />
      </div>
    </form>
  );
}
