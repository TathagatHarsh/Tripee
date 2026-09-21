"use client";

import { useMemo, useState } from "react";
import type { EggType } from "@prisma/client";
import {
  EGG_LABEL, eggTypesOffered, findVariant, sellable, sizeDiameter, sizeName, sizesOffered,
  type CakeProductView, type CakeVariantView,
} from "@/lib/cakes";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import type { SizeBand } from "@/lib/schema";

/**
 * Choosing which version of a cake to buy.
 *
 * ## One implementation, two hosts
 *
 * §13 of the brief asks that the card and the detail page not behave
 * differently, and the way to guarantee that is not discipline — it is that
 * there is one piece of code. `useVariantPick` is the whole selection rule and
 * `<VariantChoices>` is the whole control, and they are used by exactly two
 * things: the bottom sheet the card opens, and the panel on the cake's own page.
 * Neither knows anything about the rule beyond what it gets back from the hook.
 *
 * What differs between them is the *frame* — a dialog versus a column on a page
 * — and that is the only thing each one implements for itself.
 *
 * ## Nothing here is state that could go stale
 *
 * The hook keeps two pieces of state and they are *intentions*, not answers:
 * "the size the shopper clicked" and "the sponge they clicked". What is offered
 * and what is selected are both derived on every render from the product's own
 * variants, so a size that is no longer sold, a sponge that does not exist in
 * the newly-chosen size, and a cake with one option in a dimension are all the
 * same case and none of them needs an effect to clean up after it.
 *
 * That last one is §6's rule: "if a cake only supports one of these options,
 * only show the supported option". A dimension with one choice resolves itself,
 * so the CTA is live immediately and the shopper is not asked to confirm a
 * decision that was never theirs.
 */

export interface VariantPick {
  /** Every size on sale, smallest first. */
  sizes: SizeBand[];
  /** The sponges on sale *in the chosen size*. Empty until a size is chosen. */
  eggTypes: EggType[];
  /** Null until it is settled — either clicked, or the only one there is. */
  size: SizeBand | null;
  eggType: EggType | null;
  setSize: (s: SizeBand) => void;
  setEggType: (e: EggType) => void;
  /** The row this adds up to. Undefined until both halves are settled. */
  variant: CakeVariantView | undefined;
  /** Nothing to sell: no variant on sale, or the cake itself is off the shelf. */
  soldOut: boolean;
}

export function useVariantPick(product: CakeProductView): VariantPick {
  const sizes = useMemo(() => sizesOffered(product), [product]);

  const [wantSize, setWantSize] = useState<SizeBand | null>(null);
  /* The clicked size if it is still on sale; the only size if there is one;
     otherwise undecided. Derived rather than corrected in an effect, so a cake
     whose 2 kg is withdrawn while this page is open simply stops offering it. */
  const size =
    wantSize && sizes.includes(wantSize) ? wantSize : sizes.length === 1 ? sizes[0] : null;

  const eggTypes = useMemo(
    () => (size ? eggTypesOffered(product, size) : []),
    [product, size],
  );

  const [wantEgg, setWantEgg] = useState<EggType | null>(null);
  const eggType =
    wantEgg && eggTypes.includes(wantEgg)
      ? wantEgg
      : eggTypes.length === 1
        ? eggTypes[0]
        : null;

  const variant = size && eggType ? findVariant(product, size, eggType) : undefined;

  return {
    sizes,
    eggTypes,
    size,
    eggType,
    setSize: setWantSize,
    setEggType: setWantEgg,
    variant,
    soldOut: sellable(product).length === 0,
  };
}

/**
 * What a variant costs, as the customer sees it before checkout.
 *
 * Priced for pickup, which is how a cake's price is quoted everywhere it is
 * shown before the till: the figure is the cake and the tax on it, and the
 * delivery charge arrives when the slot is chosen. Quoting standard delivery
 * here would be quoting a decision nobody has made. The same function prices it
 * again at the till, from the same row, against the server's own catalogue —
 * see lib/pricing, and `reviewBasket`, which is the one that decides money.
 */
export function variantTotal(
  product: Pick<CakeProductView, "name">,
  variant: Pick<CakeVariantView, "pricePaise">,
  catalog: CatalogSnapshot,
): number {
  return priceProduct(
    { name: product.name, pricePaise: variant.pricePaise },
    { delivery: "pickup" },
    catalog,
  ).total;
}

/**
 * The two option groups.
 *
 * A radio group in the accessibility tree and buttons in the DOM, which is the
 * arrangement worth explaining. Native `<input type="radio">` would be less
 * code, but a radio's own box cannot be restyled — only hidden behind a label —
 * and what is wanted here is a card carrying a weight, a diameter and a price.
 * So: `role="radiogroup"` with `role="radio"` children and `aria-checked`, which
 * is the pattern the ARIA APG specifies for exactly this, plus arrow-key
 * movement, because a radio group that only answers to Tab is not one.
 *
 * A dimension with exactly one answer is not rendered as a group of one. It is
 * a line of text stating the fact, because a radio you cannot not-choose is
 * furniture.
 */
export function VariantChoices({
  product,
  catalog,
  pick,
  /** Ids have to be unique on a page that may hold several of these. */
  idPrefix,
}: {
  product: CakeProductView;
  catalog: CatalogSnapshot;
  pick: VariantPick;
  idPrefix: string;
}) {
  const { sizes, eggTypes, size, eggType, setSize, setEggType } = pick;

  /**
   * What to print beside a size.
   *
   * The price for the sponge already chosen, when one is; otherwise the
   * cheapest that size can be had for, with "from" in front so the number is
   * not read as a promise. Without the qualifier a shopper picks 1 kg at
   * "₹2,099", chooses eggless, and watches the figure move for no stated reason.
   */
  function sizePrice(s: SizeBand): { amount: number; from: boolean } | null {
    const exact = eggType ? findVariant(product, s, eggType) : undefined;
    if (exact) return { amount: variantTotal(product, exact, catalog), from: false };

    const forSize = sellable(product).filter((v) => v.sizeBand === s);
    if (forSize.length === 0) return null;
    const cheapest = forSize.reduce((a, b) => (a.pricePaise <= b.pricePaise ? a : b));
    return { amount: variantTotal(product, cheapest, catalog), from: forSize.length > 1 };
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Size ─────────────────────────────────────────────────────── */}
      {sizes.length > 1 ? (
        <Group label="Choose your size" id={`${idPrefix}-size`}>
          <OptionGrid
            labelledBy={`${idPrefix}-size`}
            values={sizes}
            selected={size}
            onSelect={setSize}
            render={(s) => {
              const price = sizePrice(s);
              return {
                title: sizeName(s),
                note: sizeDiameter(s) || undefined,
                amount: price
                  ? `${price.from ? "from " : ""}${formatINR(price.amount)}`
                  : undefined,
              };
            }}
          />
        </Group>
      ) : (
        sizes.length === 1 && (
          <Fact
            label="Size"
            value={`${sizeName(sizes[0])}${sizeDiameter(sizes[0]) ? ` · ${sizeDiameter(sizes[0])}` : ""}`}
          />
        )
      )}

      {/* ── Egg or eggless ───────────────────────────────────────────── */}
      {size === null ? (
        /* Deliberately a sentence and not a disabled group. A greyed-out
           "With egg / Eggless" invites somebody to click it and be ignored;
           saying what the next step is costs one line and answers the question
           the empty space would otherwise raise. */
        <p className="text-[0.875rem] text-s-bark">Pick a size to see how it can be baked.</p>
      ) : eggTypes.length > 1 ? (
        <Group label="Choose your cake" id={`${idPrefix}-egg`}>
          <OptionGrid
            labelledBy={`${idPrefix}-egg`}
            values={eggTypes}
            selected={eggType}
            onSelect={setEggType}
            render={(e) => {
              const v = findVariant(product, size, e);
              return {
                title: EGG_LABEL[e],
                amount: v ? formatINR(variantTotal(product, v, catalog)) : undefined,
              };
            }}
          />
        </Group>
      ) : (
        eggTypes.length === 1 && <Fact label="Sponge" value={EGG_LABEL[eggTypes[0]]} />
      )}
    </div>
  );
}

function Group({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span id={id} className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A dimension with exactly one answer, stated rather than offered. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
        {label}
      </span>
      <span className="text-[0.9375rem] text-s-cocoa">{value}</span>
    </div>
  );
}

interface OptionFace {
  title: string;
  note?: string;
  amount?: string;
}

/**
 * The radio group itself.
 *
 * Roving tabindex: exactly one option is tabbable and the arrow keys move
 * between them, which is what makes the group one stop in the tab order instead
 * of four and is required for the `radiogroup` role to be honest. Nothing is
 * auto-selected on arrow, because selection here changes a price and a shopper
 * arrowing past 5 kg should not be quoted for it.
 */
function OptionGrid<T extends string>({
  labelledBy,
  values,
  selected,
  onSelect,
  render,
}: {
  labelledBy: string;
  values: readonly T[];
  selected: T | null;
  onSelect: (v: T) => void;
  render: (v: T) => OptionFace;
}) {
  /* Where the tab stop sits: the chosen option, or the last one focused, or the
     first — so the group is always reachable, including before a choice. */
  const [focused, setFocused] = useState<T | null>(null);
  const tabbable = selected ?? focused ?? values[0];

  function move(from: T, delta: number) {
    const at = values.indexOf(from);
    if (at === -1) return;
    const next = values[(at + delta + values.length) % values.length];
    setFocused(next);
    /* The DOM focus has to follow, or the arrow key moves a highlight nobody's
       screen reader mentions. Queried rather than held in a ref array: the list
       is at most six items and is re-keyed whenever the size changes. */
    document.getElementById(`${labelledBy}-${next}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      /* Two columns everywhere, rather than auto-fitting as many as will go.
         Auto-fit put three sizes on the first row and the fourth alone on the
         second, which reads as a wrapped list rather than a set of choices;
         four sizes are a 2x2 and six are a 3x2. It also keeps every option the
         same width, so the prices line up down a column. */
      className="grid grid-cols-2 gap-2"
    >
      {values.map((v) => {
        const face = render(v);
        const on = selected === v;
        return (
          <button
            key={v}
            id={`${labelledBy}-${v}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={tabbable === v ? 0 : -1}
            onClick={() => {
              setFocused(v);
              onSelect(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(v, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(v, -1);
              }
            }}
            className={
              "s-opt flex min-h-[3.5rem] flex-col items-start justify-center gap-0.5 " +
              "rounded-s-sm border px-3.5 py-2.5 text-left " +
              "transition-[background-color,border-color,box-shadow] " +
              "duration-[var(--dur-ui)] ease-[var(--ease-out)] " +
              (on
                ? "border-s-berry bg-s-berry-wash text-s-cocoa"
                : "border-s-line-strong bg-s-shell text-s-cocoa hover:border-s-cocoa hover:bg-s-cream-deep")
            }
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className="text-[0.9375rem] leading-none font-medium">{face.title}</span>
              {/* The selected mark, drawn rather than a bullet: it pops in, and
                  it is `aria-hidden` because `aria-checked` above is what a
                  screen reader is already being told. */}
              <span
                aria-hidden
                className={
                  "inline-flex size-4 shrink-0 items-center justify-center rounded-full " +
                  (on ? "s-opt-mark bg-s-berry text-white" : "border border-s-line-strong")
                }
              >
                {on && (
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" focusable="false">
                    <path
                      d="m5 12.5 4.5 4.5L19 7.5"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
            </span>
            {face.note && (
              <span className="font-mono text-[0.6875rem] tracking-[0.06em] text-s-bark uppercase">
                {face.note}
              </span>
            )}
            {face.amount && (
              <span className="font-mono text-[0.8125rem] tabular-nums text-s-bark">
                {face.amount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
