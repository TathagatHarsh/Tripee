"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CakeChoices } from "./cakes";
import { MAX_QTY } from "./checkout";

/**
 * The shopping cart.
 *
 * ## Why there is one, and why it is this shape
 *
 * There was no cart before the storefront, because the product was a builder and
 * the builder's review step placed exactly one order for exactly one cake. This
 * is the missing piece for the ordinary HOME → SHOP → DETAIL → CART → CHECKOUT
 * journey, and it is the *only* cart in the app. It does not replace
 * `lib/store.ts`, which holds the single cake the 3D builder is editing and is a
 * different object doing a different job; the two never write to each other.
 *
 * A line is a cake's **slug**, the **variant** chosen for it, and the three
 * choices a shopper makes about it. It used to be a whole `CakeConfig`, because
 * a shop product used to *be* a hardcoded config; now a cake is a database row
 * and the browser has no business holding a copy of its recipe. Both the slug
 * and the variant id are references the server resolves — see `reviewBasket`,
 * which reads the size, the sponge, the price, the name and the availability off
 * the rows and ignores everything else the browser sent.
 *
 * ## What it deliberately does not hold
 *
 * **No prices, and now no names or photographs either.** Not the line price,
 * not the subtotal. An admin can reprice or rename a cake between somebody
 * adding it and paying for it; anything cached in localStorage is a value from
 * a week ago shown as if it were today's. Every screen reads the current row
 * and `/api/orders` reads it again on the server before it writes.
 *
 * **No order state.** An order is a database row with a reference and a status
 * machine; this is a list a browser is keeping until somebody checks out.
 *
 * ## localStorage, not sessionStorage
 *
 * The builder persists to sessionStorage because a half-built cake belongs to
 * the tab it is being built in. A cart is the opposite: somebody adds a cake,
 * closes the laptop, and expects it to be there tomorrow.
 */

export interface CartLine {
  /** Stable identity: the same variant with the same choices is the same line. */
  id: string;
  /** The cake, by the only name the server will accept for it. */
  slug: string;
  /**
   * Which version of it: a `CakeVariant` id.
   *
   * Part of the line's identity rather than part of its choices, because it is
   * the only field here the server resolves to a *price*. Two sizes of one cake
   * are two lines; see `lineId`.
   */
  variantId: string;
  /** What the shopper decided: message, slot, pincode. */
  choices: CakeChoices;
  qty: number;
}

/**
 * Cap per line. See the note in app/checkout — one line-unit is one docket.
 *
 * Re-exported rather than declared, because the number has to be enforced in
 * two places and this file is `"use client"`: a route handler cannot import it
 * from here without dragging zustand into a server bundle, which is why the
 * server did not enforce it at all before. It lives in lib/checkout, which is
 * pure.
 */
export { MAX_QTY } from "./checkout";

/**
 * Two of the same cake, in the same size and sponge, ordered the same way,
 * should merge into one line of two; two that differ by so much as a piped
 * message should not.
 *
 * The variant is in the key and that is §9 of the brief in one expression:
 * Pineapple Delight 1 kg with egg and Pineapple Delight 1 kg eggless are two
 * different things to bake at two different prices, and a key that omitted the
 * variant would quietly collapse them into one line of two — charging for the
 * first and baking two of it.
 *
 * The choices are canonicalised because `JSON.stringify` is key-order sensitive
 * and an object built by a form and one restored from storage can carry the
 * same fields in a different order.
 */
export function lineId(slug: string, variantId: string, choices: CakeChoices): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(choices)
        .filter(([, v]) => v !== undefined && v !== "")
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return `${slug}::${variantId}::${canonical}`;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, "id" | "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  replace: (id: string, line: Omit<CartLine, "id">) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],

      add: ({ slug, variantId, choices }, qty = 1) =>
        set((s) => {
          const id = lineId(slug, variantId, choices);
          const at = s.lines.findIndex((l) => l.id === id);
          if (at === -1) {
            return { lines: [...s.lines, { id, slug, variantId, choices, qty: clamp(qty) }] };
          }
          const lines = [...s.lines];
          lines[at] = { ...lines[at], qty: clamp(lines[at].qty + qty) };
          return { lines };
        }),

      setQty: (id, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.id !== id)
              : s.lines.map((l) => (l.id === id ? { ...l, qty: clamp(qty) } : l)),
        })),

      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),

      clear: () => set({ lines: [] }),
      replace: (oldId, line) => set(s => {
        const id = lineId(line.slug, line.variantId, line.choices);
        const other = s.lines.find(l => l.id === id && l.id !== oldId);
        return { lines: [...s.lines.filter(l => l.id !== oldId && l.id !== id), { ...line, id, qty: clamp(line.qty + (other?.qty ?? 0)) }] };
      }),
    }),
    {
      name: "makemycake.cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines }),
      /* Rehydrate after mount so the server and the client render the same first
         frame — without this the empty cart flashes over a full one, and in a
         Server Component tree that is a hydration mismatch rather than a blink. */
      skipHydration: true,
      /*
       * Every line is re-validated on read, and a line that no longer parses is
       * dropped rather than taking the cart down with it. A cart can sit in a
       * browser for weeks.
       *
       * That is also what handles the carts already out there from before this
       * phase. Two generations of them now: the oldest hold a whole `CakeConfig`
       * and no `choices`, and the ones from the single-price shop hold choices
       * but no `variantId`. Neither parses, so both are dropped — quietly, and
       * correctly. A line with no variant names a cake but not which size or
       * sponge of it, and the only ways to resolve that are to guess (and bake
       * the wrong cake) or to ask (which is a shelf, not a cart). Sending the
       * shopper back to a shelf that is telling the truth is the honest one.
       */
      merge: (persisted, current) => {
        const raw = (persisted as { lines?: unknown })?.lines;
        if (!Array.isArray(raw)) return current;

        const lines: CartLine[] = [];
        for (const entry of raw) {
          if (typeof entry !== "object" || entry === null) continue;
          const e = entry as Partial<CartLine>;
          if (typeof e.slug !== "string" || !e.slug) continue;
          if (typeof e.variantId !== "string" || !e.variantId) continue;
          const parsed = CakeChoices.safeParse(e.choices);
          if (!parsed.success) continue;
          lines.push({
            id: lineId(e.slug, e.variantId, parsed.data),
            slug: e.slug,
            variantId: e.variantId,
            choices: parsed.data,
            qty: clamp(Number(e.qty) || 1),
          });
        }
        return { ...current, lines };
      },
    },
  ),
);

/**
 * A quantity, or the nearest legal one.
 *
 * `Number.isFinite` is not theoretical: `clamp` is reached from `merge` with
 * whatever a fortnight-old localStorage entry holds, and `Math.trunc(NaN)` is
 * `NaN`, which every comparison lets through unchanged. A line with `qty: NaN`
 * renders a blank spinner and prices the basket at NaN.
 */
function clamp(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_QTY, Math.trunc(n)));
}

let started = false;

/**
 * True once localStorage has been read. Gate any cart-dependent UI on it, or
 * the server's "0" and the browser's "3" become a hydration error.
 */
export function useCartHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useCart.persist.onFinishHydration(onChange),
    () => useCart.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (started) return;
    started = true;
    void useCart.persist.rehydrate();
  }, []);

  return hydrated;
}

/** Total number of cakes in the cart — the number on the header's badge. */
export const useCartCount = () =>
  useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
