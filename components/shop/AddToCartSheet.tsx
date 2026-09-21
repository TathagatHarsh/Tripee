"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { PriceRoll } from "@/components/shop/PriceRoll";
import { useVariantPick, VariantChoices, variantTotal } from "@/components/shop/VariantPicker";
import { DEFAULT_CHOICES, variantLabel, type CakeProductView } from "@/lib/cakes";
import { useCart } from "@/lib/cart";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { formatINR } from "@/lib/format";
import { sBtn } from "@/lib/shopUi";

/**
 * "Add to cart" on a card, and what it opens.
 *
 * ## Why the click no longer adds anything
 *
 * §2 of the brief: a cake has a size and a sponge now, so a button that added
 * one would be choosing both on the shopper's behalf — quietly picking the
 * cheapest, or the first, and charging for it. The button opens the question
 * instead. This replaces `<AddToCart>` on the card; the detail page keeps a
 * direct add, because the same question is already answered in the panel there.
 *
 * ## `<dialog>`, not a div with a portal
 *
 * The native element brings the focus trap, Escape, the inert background, the
 * top-layer stacking that a sticky header would otherwise fight, and the
 * `::backdrop` pseudo-element. Reimplementing those is roughly two hundred lines
 * and one of them is always subtly wrong — usually the focus return. What is
 * written here is the part `<dialog>` does not do: closing on a backdrop click,
 * and the CSS transitions in globals.css.
 *
 * The element is only mounted while it is open. Twenty-one cards on /shop means
 * twenty-one of these, and twenty-one always-rendered dialogs is twenty-one
 * hidden subtrees the browser lays out for nothing.
 *
 * ## Desktop dialog, mobile bottom sheet
 *
 * One element, two shapes, decided in CSS rather than by measuring the viewport
 * in JavaScript — see `.s-sheet` in globals.css. A media query cannot be wrong
 * about the first frame the way a `useState(window.innerWidth)` can.
 */
export function AddToCartSheet({
  product,
  catalog,
  /** Appended to the trigger's accessible name — "Add to cart, Pineapple Delight". */
  srSuffix,
  className = "",
}: {
  product: CakeProductView;
  catalog: CatalogSnapshot;
  srSuffix?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        className={sBtn("primary", "md", className)}
      >
        Add to cart
        {srSuffix && <span className="sr-only">, {srSuffix}</span>}
      </button>

      {open && (
        <Sheet
          product={product}
          catalog={catalog}
          onClose={() => {
            setOpen(false);
            /* Focus goes back to the button that opened it. `<dialog>` does this
               for itself when the element stays mounted, and this one does
               not — so it is done by hand rather than lost to the body. */
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * The sheet's own body.
 *
 * A separate component so that everything inside it — the chosen size, the
 * chosen sponge, whether the cake has been added — is created fresh each time it
 * opens and thrown away on close. Somebody who opens the sheet, picks 2 kg and
 * closes it without buying should not find 2 kg still selected a minute later.
 */
function Sheet({
  product,
  catalog,
  onClose,
}: {
  product: CakeProductView;
  catalog: CatalogSnapshot;
  onClose: () => void;
}) {
  const pick = useVariantPick(product);
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null);

  /* `showModal()` on the element as it mounts. A ref callback rather than an
     effect, so the dialog is open on the frame it appears — an effect runs after
     paint, which is one frame of an invisible element and a late backdrop. */
  const mount = useCallback((el: HTMLDialogElement | null) => {
    dialog.current = el;
    if (el && !el.open) el.showModal();
  }, []);

  /* `<dialog>` fires `close` for Escape and for `close()` alike, so one listener
     covers every way out and the caller's focus restore cannot be skipped. */
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const closed = () => onClose();
    el.addEventListener("close", closed);
    return () => el.removeEventListener("close", closed);
  }, [onClose]);

  /** Ask the element to close; the `close` event above does the rest. */
  const dismiss = useCallback(() => dialog.current?.close(), []);

  /*
   * After adding: the sheet stays open for a moment, says so, and closes itself.
   *
   * §12 asks for confirmation rather than a modal that vanishes. The
   * acknowledgement is in the sheet — where the eye already is — instead of a
   * toast, which would need a portal above this dialog's own top layer and a
   * dismissal policy, to say four words somewhere nobody is looking. The cart
   * badge in the header ticks up at the same moment, which is the second half of
   * the answer to "did that work".
   *
   * The timer is cleared on unmount: a shopper who hits Escape during the
   * acknowledgement has already closed the sheet.
   */
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(dismiss, 2200);
    return () => clearTimeout(t);
  }, [added, dismiss]);

  const { variant, soldOut } = pick;
  const total = variant ? variantTotal(product, variant, catalog) : null;

  return (
    <dialog
      ref={mount}
      /* `.s-root` so the storefront's tokens and animations reach inside: a
         dialog renders in the top layer, outside the page's own tree. */
      className="s-root s-sheet"
      aria-labelledby="sheet-title"
      onClick={(e) => {
        /* The backdrop is a pseudo-element, so a click on it lands on the dialog
           itself with coordinates outside the box. Guarded on the target being
           the dialog so a drag that starts on a child does not close it. */
        if (e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        const outside =
          e.clientX < box.left || e.clientX > box.right ||
          e.clientY < box.top || e.clientY > box.bottom;
        if (outside) dismiss();
      }}
    >
      <div className="s-sheet-body flex max-h-[85dvh] flex-col">
        {/* The grab handle, on a phone only — see globals.css. */}
        <span aria-hidden className="s-sheet-grip" />

        {/* ── What cake this is ────────────────────────────────────────── */}
        <div className="flex items-start gap-4 border-b border-s-line px-5 pt-4 pb-4 sm:px-7 sm:pt-6">
          <div className="s-photo-well relative size-20 shrink-0 overflow-hidden rounded-s-sm sm:size-24">
            <CakePhoto
              src={product.imageUrl}
              /* Empty: the name is the dialog's own label, immediately beside
                 it, and a picture that repeats its heading is read twice. */
              alt=""
              config={product.config}
              sizes="96px"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="sheet-title" className="text-[1.25rem] leading-tight sm:text-[1.4375rem]">
              {product.name}
            </h2>
            <p className="line-clamp-2 text-[0.875rem] leading-snug text-s-bark">
              {product.description}
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-s-sm text-s-bark transition-colors hover:bg-s-cream-deep hover:text-s-cocoa"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden focusable="false">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── The choices ──────────────────────────────────────────────── */}
        <div className="s-scroll-y min-h-0 flex-1 px-5 py-5 sm:px-7">
          {soldOut ? (
            <p role="alert" className="text-[0.9375rem] leading-relaxed text-s-berry">
              Every size of this cake is off the shelf at the moment. Give the
              counter a ring and we will tell you when it is back.
            </p>
          ) : (
            <VariantChoices
              product={product}
              catalog={catalog}
              pick={pick}
              idPrefix={`sheet-${product.slug}`}
            />
          )}
        </div>

        {/* ── The total and the commitment ─────────────────────────────── */}
        {!soldOut && (
          <div className="flex flex-col gap-3 border-t border-s-line bg-s-cream-deep/40 px-5 py-4 sm:px-7">
            {added ? (
              /* The acknowledgement, in the place the price was. Swapped rather
                 than stacked, so the sheet does not grow and shove the button
                 out from under a thumb already on its way down. */
              <div className="s-rise-in flex flex-wrap items-center justify-between gap-3">
                <p
                  /* `status` and not `alert`: this is a confirmation, and an
                     assertive announcement would interrupt a screen reader
                     mid-sentence to say something nobody is anxious about. */
                  role="status"
                  className="flex items-center gap-2 text-[0.9375rem] font-medium text-s-cocoa"
                >
                  <span className="s-seal inline-flex size-6 items-center justify-center rounded-full bg-s-berry text-white">
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden focusable="false">
                      <path
                        className="s-check"
                        d="m5 12.5 4.5 4.5L19 7.5"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  Added to your box
                </p>
                <Link href="/cart" className={sBtn("dark", "md")}>
                  View cart
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
                    Total
                  </span>
                  {/* `aria-live` on the wrapper, never on the figure: a live
                      region that is itself replaced announces nothing. The
                      figure rolls rather than swapping — see PriceRoll, and the
                      buy panel's price, which is the same control. */}
                  <span aria-live="polite" className="text-right">
                    {total === null ? (
                      <span className="text-[0.9375rem] text-s-bark">Choose an option</span>
                    ) : (
                      <PriceRoll
                        text={formatINR(total)}
                        className="font-mono text-[1.5rem] font-medium tabular-nums text-s-cocoa"
                      />
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={!variant}
                  onClick={() => {
                    if (!variant) return;
                    add({
                      slug: product.slug,
                      variantId: variant.id,
                      /* Message, slot and pincode are settled at checkout — one
                         delivery per order — so the line goes in with the
                         default slot, exactly as it did before variants. */
                      choices: DEFAULT_CHOICES,
                    });
                    setAdded(true);
                  }}
                  className={sBtn("primary", "lg", "w-full")}
                >
                  Add to cart
                </button>

                <p className="text-center text-[0.8125rem] text-s-bark">
                  {variant
                    ? `${variantLabel(variant)} · incl. GST, delivery at checkout`
                    : "Incl. GST. Delivery is added when you pick a slot."}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
