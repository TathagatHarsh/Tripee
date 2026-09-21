"use client";

import type { CSSProperties } from "react";
import { rollCells } from "@/lib/format";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * A total that counts rather than jumps.
 *
 * §7: changing the size or the sponge should look like the machine at the
 * counter turning, not like one number being swapped for another.
 *
 * ## No JavaScript animates this
 *
 * Every column is a strip of ten glyphs behind a one-glyph window, and the
 * chosen digit is just how far that strip is pushed up. Changing the digit
 * changes a CSS `translate`, and the browser interpolates it — which *is* the
 * roll: 4 → 7 passes through 5 and 6 because those glyphs physically sit
 * between them on the strip. No interval, no rAF, no library, nothing on the
 * main thread, and none of the "animate through every integer" cost §7 warns
 * about — the work is the same whether the total moves by ₹10 or ₹10,000.
 *
 * GSAP is already in the tree and would also have done it. It is not used here
 * because it would mean shipping an animation runtime into the card bundle to
 * do what one transition does, and because a transition is the thing that gets
 * reduced motion right for free (below).
 *
 * ## Reduced motion
 *
 * Nothing is implemented for it and nothing needs to be. The global
 * `prefers-reduced-motion: reduce` block in globals.css already forces
 * `transition-duration` to near zero on everything, so the strips are *placed*
 * at the new digits instead of travelling to them and the total simply changes.
 * That is precisely the behaviour §7 asks for, and it cannot drift out of sync
 * with the rest of the storefront the way a second `useReducedMotion` check
 * could.
 *
 * ## What a screen reader gets
 *
 * The strips are `aria-hidden` and the price is repeated in an `sr-only` span.
 * Read literally, the drawn version is ten digits per column — "0123456789"
 * four times over — and inside the `aria-live` region the callers wrap this in,
 * it would be announced in full on every click.
 */
export function PriceRoll({
  text,
  className = "",
}: {
  /** The formatted price, symbol and separators included. */
  text: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>

      <span aria-hidden className="s-roll">
        {rollCells(text).map((cell) =>
          cell.digit === null ? (
            /* The symbol, a comma, the decimal point. Same box as a digit
               column so the row keeps one baseline, but no window and no
               strip: it has nowhere to roll to. */
            <span key={cell.place} className="s-roll-fixed">
              {cell.char}
            </span>
          ) : (
            <span key={cell.place} className="s-roll-col">
              <span
                className="s-roll-strip"
                /* `--d` is which glyph to show, `--place` is how far this
                   column is from the ones end — the stagger reads it so the
                   paise leave first and the rupees settle last. */
                style={{ "--d": cell.digit, "--place": cell.place } as CSSProperties}
              >
                {DIGITS.map((d) => (
                  <span key={d} className="s-roll-d">
                    {d}
                  </span>
                ))}
              </span>
            </span>
          ),
        )}
      </span>
    </span>
  );
}
