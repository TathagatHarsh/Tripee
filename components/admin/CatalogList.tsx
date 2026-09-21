"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { CatalogCategory } from "@prisma/client";
import { setAvailabilityBulk } from "@/app/admin/actions";
import { CATEGORY_META, optionHref, priceLabel } from "@/lib/adminNav";
import { formatINR } from "@/lib/format";
import { AvailabilityToggle } from "./AvailabilityToggle";
import { useToast } from "./Toast";
import { aBtn, aEyebrow, DataTable, EmptyState, Ref, Td, Th, Tr } from "./ui";
import { Icon } from "./icons";

/**
 * One category of options, as a table on a desktop and as cards on a phone.
 *
 * §20 asks for image, name, price, availability, updated and an action, in that
 * hierarchy; §21 asks that the image lead, because this is a cake business.
 * §33 asks for the table on desktop and stacked cards on mobile. Both layouts
 * are rendered and CSS picks — `hidden sm:block` and `sm:hidden` — rather than
 * one layout being reshaped by media queries. That doubles the markup and it is
 * the right trade: a table reflowed into a stack keeps the `<td>` semantics and
 * reads to a screen reader as a table with one cell per row, and the two
 * layouts genuinely want different information (the card can afford the blurb;
 * the row cannot).
 *
 * ## Why this is a client component
 *
 * Selection. §22's bulk availability needs a set of checked ids, and there is
 * no way to hold that on the server without a round trip per checkbox. The rows
 * themselves are fetched and rendered by the server page above this; what
 * crosses into the browser is an array of plain data and this file.
 */

export interface Row {
  id: string;
  category: CatalogCategory;
  value: string;
  name: string;
  blurb: string;
  swatch: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  priceInputPaise: number;
  isAvailable: boolean;
  updatedAt: string;
  /** How many recorded price changes this option has. Drives the history hint. */
  changes: number;
}

export function CatalogList({
  category,
  rows,
  /** The current search term, so the empty state can offer to clear it. */
  query,
}: {
  category: CatalogCategory;
  rows: Row[];
  query: string;
}) {
  const meta = CATEGORY_META[category];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, bulkSubmit, bulkPending] = useActionState(setAvailabilityBulk, undefined);
  const { toast } = useToast();

  /*
   * Announce a bulk result once, and clear the selection when it landed.
   *
   * The clearing is done during render rather than in the effect beside the
   * toast, which is the shape react-hooks/set-state-in-effect asks for: a
   * `setState` in an effect body commits one render and then immediately
   * schedules another. Comparing the action's result object to the last one
   * seen is React's documented way to adjust state when an input changes —
   * `useActionState` hands back a fresh object per submission, so this fires
   * exactly once per result.
   *
   * The toast stays in an effect because it genuinely is an external side
   * effect rather than state, and firing it during render would announce it
   * again on every re-render that follows.
   */
  const [seenBulk, setSeenBulk] = useState(bulkState);
  if (bulkState !== seenBulk) {
    setSeenBulk(bulkState);
    if (bulkState?.ok) setSelected(new Set());
  }

  useEffect(() => {
    if (bulkState) toast(bulkState.message, bulkState.ok);
  }, [bulkState, toast]);

  /*
   * Selection is pruned against the rows actually on screen. Without this,
   * searching after selecting three options leaves those ids in the set and the
   * bulk bar offering to withdraw options that are no longer visible — which is
   * the bulk-action bug that gets shipped every time.
   */
  const visible = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const chosen = useMemo(
    () => [...selected].filter((id) => visible.has(id)),
    [selected, visible],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChosen = rows.length > 0 && chosen.length === rows.length;

  if (rows.length === 0) {
    return query ? (
      <EmptyState
        icon="search"
        title={`No ${meta.plural.toLowerCase()} match “${query}”.`}
        blurb="Try a shorter search, or clear it to see everything in this category."
      >
        <Link href="?" className={aBtn("secondary", "md")}>Clear search</Link>
      </EmptyState>
    ) : (
      /*
       * A genuinely empty category means the seed has not run — every one of
       * these ten categories is populated from lib/catalogDefaults, and there
       * is no "add an option" button anywhere in this portal because a new
       * option needs a mesh and an allergen entry that a form cannot supply.
       * So this says what is actually wrong rather than offering a button that
       * would not help.
       */
      <EmptyState
        icon="alert"
        title={`No ${meta.plural.toLowerCase()} in the catalogue.`}
        blurb={
          "Every category ships with its options already in place, so an empty one "
          + "means the catalogue has not been seeded on this deployment. Run the seed "
          + "and reload."
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── the bulk bar ────────────────────────────────────────────────── */}
      {chosen.length > 0 && (
        <form
          action={bulkSubmit}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-a-accent-line bg-a-accent-wash px-4 py-2.5"
        >
          {chosen.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}

          <span className="text-a-small font-semibold text-a-ink">
            {chosen.length} selected
          </span>

          <div className="ml-auto flex flex-wrap gap-2">
            {/*
              Two submit buttons on one form, distinguished by `value` on the
              same `name`. A submit button's value is what gets sent, so the
              action reads `next` and knows which one was pressed — no
              JavaScript, and the form works identically if the bulk bar is ever
              rendered on the server.
            */}
            <button
              type="submit"
              name="next"
              value="true"
              disabled={bulkPending}
              className={aBtn("secondary", "sm")}
            >
              <Icon name="check" size={13} />
              Mark available
            </button>
            <button
              type="submit"
              name="next"
              value="false"
              disabled={bulkPending}
              className={aBtn("secondary", "sm")}
            >
              Mark unavailable
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={bulkPending}
              className={aBtn("quiet", "sm")}
            >
              Clear
            </button>
          </div>
        </form>
      )}

      {/* ── desktop: the table ──────────────────────────────────────────── */}
      <div className="hidden sm:block">
        <DataTable
          caption={`${meta.plural}, with their prices and availability`}
          minWidth="52rem"
          head={
            <>
              <Th className="w-10 pr-0">
                <label className="flex cursor-pointer items-center justify-center">
                  <span className="sr-only">
                    {allChosen ? "Deselect all" : `Select all ${meta.plural.toLowerCase()}`}
                  </span>
                  <input
                    type="checkbox"
                    checked={allChosen}
                    onChange={() =>
                      setSelected(allChosen ? new Set() : new Set(rows.map((r) => r.id)))
                    }
                    className="size-4 cursor-pointer accent-[var(--color-a-accent)]"
                  />
                </label>
              </Th>
              <Th className="w-16">Photo</Th>
              <Th>{meta.label}</Th>
              <Th align="right">{priceLabel(category)}</Th>
              <Th>Availability</Th>
              <Th align="right">Updated</Th>
              <Th align="right"><span className="sr-only">Actions</span></Th>
            </>
          }
        >
          {rows.map((r) => (
            <Tr key={r.id} className={chosen.includes(r.id) ? "bg-a-accent-wash/60" : ""}>
              <Td className="pr-0">
                <label className="flex cursor-pointer items-center justify-center">
                  <span className="sr-only">Select {r.name}</span>
                  <input
                    type="checkbox"
                    checked={chosen.includes(r.id)}
                    onChange={() => toggle(r.id)}
                    className="size-4 cursor-pointer accent-[var(--color-a-accent)]"
                  />
                </label>
              </Td>

              <Td>
                <Thumb row={r} size={44} />
              </Td>

              <Td>
                {/* The name opens the editor. §20 puts an Edit button in the
                    last column too — both, because the name is the target
                    people reach for and the button is the one they can find. */}
                <Link
                  href={optionHref(category, r.value)}
                  className="block max-w-[22rem] font-a-sans text-a-item font-medium text-a-ink underline decoration-transparent decoration-1 underline-offset-2 transition-colors hover:decoration-a-accent"
                >
                  {r.name}
                </Link>
                <span className="mt-0.5 block max-w-[26rem] truncate text-a-meta text-a-muted">
                  {r.blurb}
                </span>
              </Td>

              <Td align="right">
                <span className="font-a-mono text-a-small font-medium tabular-nums">
                  {formatINR(r.priceInputPaise)}
                </span>
                {r.changes > 0 && (
                  <span className="mt-0.5 block text-a-meta text-a-faint">
                    {r.changes} {r.changes === 1 ? "change" : "changes"}
                  </span>
                )}
              </Td>

              <Td>
                <AvailabilityToggle
                  id={r.id}
                  available={r.isAvailable}
                  label={r.name}
                  size="sm"
                />
              </Td>

              <Td align="right">
                <span className="text-a-meta text-a-muted">{r.updatedAt}</span>
              </Td>

              <Td align="right">
                <Link href={optionHref(category, r.value)} className={aBtn("ghost", "sm")}>
                  Edit
                  <Icon name="chevronRight" size={13} />
                </Link>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </div>

      {/* ── mobile: cards ───────────────────────────────────────────────── */}
      <ul className="flex flex-col sm:hidden">
        {rows.map((r) => (
          <li
            key={r.id}
            className={[
              "flex gap-3 border-b border-a-line p-3 last:border-0",
              chosen.includes(r.id) ? "bg-a-accent-wash/60" : "",
            ].join(" ")}
          >
            <label className="flex shrink-0 items-start pt-1">
              <span className="sr-only">Select {r.name}</span>
              <input
                type="checkbox"
                checked={chosen.includes(r.id)}
                onChange={() => toggle(r.id)}
                className="size-4 cursor-pointer accent-[var(--color-a-accent)]"
              />
            </label>

            <Thumb row={r} size={56} />

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={optionHref(category, r.value)}
                    className="block font-a-sans text-a-item font-semibold text-a-ink"
                  >
                    {r.name}
                  </Link>
                  <p className="mt-0.5 text-a-meta leading-snug text-a-muted">{r.blurb}</p>
                </div>
                <span className="shrink-0 font-a-mono text-a-small font-medium tabular-nums">
                  {formatINR(r.priceInputPaise)}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <AvailabilityToggle id={r.id} available={r.isAvailable} label={r.name} size="sm" />
                <Link href={optionHref(category, r.value)} className={aBtn("ghost", "sm")}>
                  Edit
                  <Icon name="chevronRight" size={13} />
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The photograph, the swatch, or nothing.
 *
 * Three states in that order of preference, and the fallback is why the swatch
 * column in the database is still worth having: a filling with no photograph is
 * still recognisably raspberry if the chip is the right red. §21 asks for an
 * image-first catalogue and this is how a category gets there gradually — every
 * row has *something*, and uploading a photo replaces it.
 *
 * `unoptimized` is deliberately not set: these go through next/image so the CDN
 * serves a 44px variant to a 44px box rather than the stored 1024px file.
 */
function Thumb({ row, size }: { row: Row; size: number }) {
  const box = "shrink-0 overflow-hidden rounded-a-sm border border-a-line";

  if (row.imageUrl) {
    return (
      <span className={`relative block ${box}`} style={{ width: size, height: size }}>
        <Image
          src={row.imageUrl}
          alt={row.imageAlt ?? row.name}
          fill
          sizes={`${size * 2}px`}
          className="object-cover"
        />
      </span>
    );
  }

  if (row.swatch) {
    return (
      <span
        className={box}
        style={{ width: size, height: size, background: row.swatch }}
        /* The colour is a stand-in for a photograph, not information — the name
           is right beside it in every layout. */
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center bg-a-sunken text-a-ghost ${box}`}
      style={{ width: size, height: size }}
    >
      <Icon name="image" size={Math.round(size * 0.4)} />
    </span>
  );
}

/** The internal value, shown only in the editor. Exported so the page can reuse it. */
export function OptionValue({ value }: { value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={aEyebrow}>Reference</span>
      <Ref className="text-a-muted">{value}</Ref>
    </span>
  );
}
