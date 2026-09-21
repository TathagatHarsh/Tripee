"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CakeChoices } from "@/lib/cakes";
import { useCart } from "@/lib/cart";
import { sBtn } from "@/lib/shopUi";

/**
 * The one control that puts a cake in the cart.
 *
 * Used by the detail page's two buttons and nothing else. It used to be on the
 * product card as well, and that is what §2 changed: a card cannot add a cake,
 * because a cake has a size and a sponge and the card has not asked. The card
 * opens `<AddToCartSheet>`, which asks and then calls the same store.
 *
 * `after: "stay"` acknowledges in place, `after: "cart"` and `after: "checkout"`
 * navigate.
 *
 * It takes a slug, a variant id and the shopper's choices — no price and no
 * name. The cart is a list of references; the rows are what everything else is
 * read from. See lib/cart.
 *
 * ## The acknowledgement
 *
 * The label changes to "Added" for a moment rather than firing a toast. A toast
 * would need a portal, a stacking context above the sticky header and a
 * dismissal policy, and it would say the same eight characters somewhere the
 * eye is not already looking. The button is where the click happened.
 *
 * The timer is cleared on unmount, because a card unmounts every time the shop
 * page is filtered and a `setState` after that is a React warning nobody can
 * act on.
 */
export function AddToCart({
  slug,
  variantId,
  choices,
  qty = 1,
  after = "stay",
  label = "Add to cart",
  /**
   * Appended to the accessible name, visible to nobody.
   *
   * A shop page carries up to nine of these and they all read "Add to cart", so
   * somebody tabbing through hears the same four words nine times with no way
   * to tell which cake is about to be bought. The cake's name goes here.
   *
   * A suffix rather than an `aria-label`, on purpose: WCAG 2.5.3 requires the
   * accessible name to *contain* the visible label, and `aria-label="Add
   * Pineapple Delight to cart"` replaces it instead. "Add to cart — Pineapple
   * Delight" contains it, so voice control still works on what is on screen.
   */
  srSuffix,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
}: {
  slug: string;
  /**
   * Which version of the cake. Optional in the type and required in practice:
   * the caller passes `variant?.id`, which is undefined until the shopper has
   * chosen, and the click is a no-op while it is. Declaring it `string` would
   * push a non-null assertion into the one component that must never guess
   * which variant somebody meant.
   */
  variantId: string | undefined;
  choices: CakeChoices;
  qty?: number;
  after?: "stay" | "cart" | "checkout";
  label?: string;
  srSuffix?: string;
  variant?: "primary" | "dark" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        /* No variant, nothing to add. `disabled` already stops this in every
           caller; the guard is what makes that a property of the component
           rather than of whoever wired it up. */
        if (!variantId) return;
        add({ slug, variantId, choices }, qty);
        if (after === "cart") return router.push("/cart");
        if (after === "checkout") return router.push("/checkout");
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1600);
      }}
      className={sBtn(variant, size, className)}
    >
      {done ? (
        <>
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden focusable="false">
            <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          Added
        </>
      ) : (
        label
      )}
      {srSuffix && <span className="sr-only">, {srSuffix}</span>}
    </button>
  );
}
