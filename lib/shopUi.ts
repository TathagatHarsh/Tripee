/**
 * The storefront's controls, as class strings.
 *
 * Same shape and the same reasoning as lib/ui.ts — which stays exactly as it is,
 * because it dresses the builder, the docket and the order pages and those are
 * not being restyled in this phase. This is the shop's own set, built on the
 * `s-` tokens in globals.css.
 *
 * A class-string helper rather than a component, for lib/ui's reason: the same
 * styling has to land on `<button>`, on next/link's `<a>` and on a `<label>`,
 * and three wrappers is three files to keep in sync for no gain.
 *
 * Never below 44px. That is the one rule both files share.
 */

type Variant =
  | "primary"   /* buy. The berry fill. One per screen region. */
  | "dark"      /* the cocoa fill — a secondary commitment, e.g. "View details" */
  | "outline"   /* a real alternative, findable at 3:1 */
  | "ghost";    /* quiet: a chip, a remove control, a pager step */

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "min-h-11 px-3.5 text-[0.8125rem]",
  md: "min-h-11 px-5 text-[0.9375rem]",
  lg: "min-h-14 px-7 text-[1.0625rem]",
};

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-s-berry text-white shadow-[0_1px_2px_rgb(58_35_23/0.12)] " +
    "hover:bg-s-berry-deep",
  dark:
    "bg-s-cocoa text-s-cream hover:bg-s-cocoa-deep",
  outline:
    "border border-s-line-strong bg-s-shell text-s-cocoa " +
    "hover:border-s-cocoa hover:bg-s-cream-deep",
  ghost:
    "border border-transparent bg-transparent text-s-bark " +
    "hover:bg-s-cream-deep hover:text-s-cocoa",
};

/* Disabled changes the colours, never the alpha — a 45%-alpha berry on cream
   measures about 2.4:1, and "Add to cart" is disabled the moment a page loads
   while the server price is being confirmed. */
const OFF =
  "disabled:cursor-not-allowed disabled:bg-s-cream-deep disabled:text-s-bark/70 " +
  "disabled:border-s-line disabled:shadow-none " +
  "aria-disabled:cursor-not-allowed aria-disabled:bg-s-cream-deep " +
  "aria-disabled:text-s-bark/70 aria-disabled:border-s-line";

export function sBtn(
  variant: Variant = "outline",
  size: Size = "md",
  extra = "",
): string {
  return [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-s-sm",
    "font-medium whitespace-nowrap",
    /* `duration-[var(--dur-ui)]`, not `duration-[--dur-ui]`: Tailwind v4 dropped
       the shorthand, so the short form compiles to an invalid declaration and
       silently resolves to 0s. lib/ui.ts carries the same note and the same fix. */
    "transition-[background-color,border-color,color,box-shadow,transform]",
    "duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    "motion-safe:active:scale-[0.98]",
    SIZE[size],
    VARIANT[variant],
    OFF,
    extra,
  ].join(" ");
}

/** A square icon-only control at the same height as an `md` button. */
export function sIconBtn(extra = ""): string {
  return [
    "relative inline-flex size-11 shrink-0 items-center justify-center rounded-s-sm",
    "text-s-cocoa transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    "hover:bg-s-cream-deep",
    OFF,
    extra,
  ].join(" ");
}

/** A text field. 48px, and its edge is line-strong for a control's reason. */
export function sField(extra = ""): string {
  return [
    "h-12 w-full rounded-s-sm border border-s-line-strong bg-s-shell px-4",
    "text-[0.9375rem] text-s-cocoa placeholder:text-s-bark/60",
    "transition-colors duration-[var(--dur-ui)] focus:border-s-berry",
    extra,
  ].join(" ");
}

/** The tracked-out label that names a section. 12px is the floor. */
export const sEyebrow =
  "font-mono text-[0.75rem] tracking-[0.18em] text-s-berry uppercase";

export const sEyebrowQuiet =
  "font-mono text-[0.75rem] tracking-[0.16em] text-s-bark uppercase";

/** A small fact stuck to a product photo — "Eggless", "1.5 kg". */
export function sBadge(tone: "cream" | "gold" | "berry" = "cream"): string {
  const fill = {
    cream: "bg-s-shell/95 text-s-cocoa",
    gold: "bg-s-gold text-s-gold-ink",
    berry: "bg-s-berry-wash text-s-berry",
  }[tone];
  return [
    "inline-flex items-center rounded-full px-2.5 py-1",
    "font-mono text-[0.6875rem] tracking-[0.09em] uppercase",
    "backdrop-blur-sm",
    fill,
  ].join(" ");
}

/** One control in a pager, or a filter chip. */
export function sChip(active = false, extra = ""): string {
  return [
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4",
    "text-[0.875rem] whitespace-nowrap",
    "transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    active
      ? "bg-s-cocoa text-s-cream"
      : "border border-s-line-strong bg-s-shell text-s-bark hover:border-s-cocoa hover:text-s-cocoa",
    extra,
  ].join(" ");
}

/** The card everything on this storefront sits in. */
export const sCard =
  "rounded-s border border-s-line bg-s-shell shadow-[var(--shadow-s-card)]";
