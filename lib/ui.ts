/**
 * Three button variants, not seven.
 *
 * There were seven hand-rolled button implementations across the app — the
 * landing nav CTA, undo/redo, "Make it mine", the step footer, the review
 * actions, the violation fix, the topping remove control — at five different
 * heights between 31px and 48px, with three different disabled treatments (two
 * of them alpha-based, which put 2.25:1 text on the primary action of the whole
 * product). This is that, once.
 *
 * Deliberately a class-string helper rather than a component: the same styling
 * has to land on `<button>`, on next/link's `<a>`, and on a `<label>`, and a
 * wrapper component for each of those is three files to maintain for no gain.
 */

type Variant =
  | "primary"   /* the one way forward on this screen */
  | "secondary" /* a real alternative, findable at 3:1 */
  | "quiet"     /* undo, redo, close — present but not competing */
  | "seal";     /* a one-tap fix for something blocked, and nothing else */

type Size = "md" | "lg";

/* Never below 44px. That is the whole rule. */
const SIZE: Record<Size, string> = {
  md: "min-h-11 px-4 text-body",
  lg: "min-h-14 px-6 text-item",
};

const VARIANT: Record<Variant, string> = {
  primary:
    "border border-ink bg-ink text-paper shadow-primary " +
    "hover:bg-graphite hover:border-graphite",
  secondary:
    "border border-rule-strong bg-paper text-ink hover:border-ink",
  quiet:
    "border border-rule bg-transparent text-graphite hover:border-rule-strong hover:text-ink",
  seal:
    "border border-seal bg-seal text-paper hover:opacity-90",
};

/*
 * Disabled changes the colours, never the alpha. `disabled:opacity-45` on ink
 * over paper measures about 2.25:1, and on the review screen that was the state
 * the primary action was in the moment the page loaded.
 */
const OFF =
  "disabled:cursor-not-allowed disabled:border-rule disabled:bg-slab-deep " +
  "disabled:text-steel disabled:shadow-none " +
  "aria-disabled:cursor-not-allowed aria-disabled:border-rule " +
  "aria-disabled:bg-slab-deep aria-disabled:text-steel aria-disabled:shadow-none";

/*
 * `duration-[var(--dur-ui)]`, not `duration-[--dur-ui]`.
 *
 * Tailwind v4 dropped the `[--x]` shorthand for `var(--x)`, so the shorthand now
 * compiles to the literal `transition-duration: --dur-ui` — invalid, silently
 * resolved to 0s. Every button in the app was jumping between states rather than
 * transitioning, which is not what any of this code says it wants. Verified in
 * the built stylesheet. The same shorthand is still in use in about thirty other
 * places outside this file.
 */
export function btn(
  variant: Variant = "secondary",
  size: Size = "md",
  extra = "",
): string {
  return [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-card font-medium",
    "whitespace-nowrap transition-[background-color,border-color,color,box-shadow]",
    "duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    SIZE[size],
    VARIANT[variant],
    OFF,
    extra,
  ].join(" ");
}

/**
 * One control in a pager: a page number, or the step either side of it.
 *
 * A class-string helper for the same reason `btn` is one — the app's two pagers
 * put these classes on different elements. The catalogue at /presets pages
 * through URLs, so its controls are links and its unavailable steps are spans;
 * the landing page's section pages in local state, so its controls are buttons.
 * The one thing that must not differ between them is how they look.
 *
 * Never below 44px, like everything else in this file.
 */
export function pager(current = false, extra = ""): string {
  return [
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-card px-3.5",
    "font-mono text-meta tabular-nums",
    "transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    current
      ? "border border-ink bg-ink text-paper"
      : "border border-rule-strong bg-paper text-graphite hover:border-ink hover:text-ink",
    OFF,
    extra,
  ].join(" ");
}

/** A square icon-only control at the same height as a `md` button. */
export function iconBtn(extra = ""): string {
  return [
    "inline-flex size-11 shrink-0 items-center justify-center rounded-card",
    "border border-rule bg-paper text-graphite",
    "transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)]",
    "enabled:hover:border-rule-strong enabled:hover:text-ink",
    OFF,
    extra,
  ].join(" ");
}

/**
 * A text field. 52px, because a field a customer has to find and then type a
 * phone number into is not a 34px slot, and its border is rule-strong for the
 * same reason a button's is.
 */
export function field(extra = ""): string {
  return [
    "h-13 w-full rounded-card border border-rule-strong bg-paper px-4 text-item text-ink",
    "transition-colors duration-[var(--dur-ui)] focus:border-ink",
    extra,
  ].join(" ");
}

/** The mono variant of the same field: pincode, phone number, reference. */
export function monoField(extra = ""): string {
  return field(`font-mono text-body tracking-[0.06em] tabular-nums ${extra}`);
}

/**
 * An eyebrow: the tracked-out mono line that names a section.
 *
 * 11px is the floor. The 8.5–10px tier the design document uses for its own
 * annotation chrome never ships.
 */
export const eyebrow =
  "font-mono text-micro tracking-[0.18em] text-brass uppercase";

/** The same, but quiet — a status line rather than a section name. */
export const eyebrowQuiet =
  "font-mono text-micro tracking-[0.13em] text-steel uppercase";

/**
 * The option-card selection language, used by every single-select group in the
 * builder. Rest is a paper card on a rule boundary, selected inverts to ink,
 * blocked goes to the counter tone with a dashed seal edge — one language, so a
 * customer learns it once on the shape step and reads it for the next eight.
 */
export const optionCard = {
  rest: "border-rule bg-paper shadow-[0_1px_0_rgb(0_0_0/0.03)] hover:border-rule-strong hover:shadow-elev-1",
  selected: "border-ink bg-ink shadow-chosen",
  blocked: "border-dashed border-seal/50 bg-counter shadow-none",
} as const;

/** Text colours that go with the three card states above. */
export const optionText = {
  name: (selected: boolean, blocked: boolean) =>
    selected ? "text-paper" : blocked ? "text-steel" : "text-ink",
  blurb: (selected: boolean) => (selected ? "text-quiet" : "text-steel"),
  delta: (selected: boolean) => (selected ? "text-brass-lit" : "text-brass"),
} as const;

/** Picks the card class for a state, so no caller has to remember the order. */
export function cardState(selected: boolean, blocked: boolean): string {
  return selected ? optionCard.selected : blocked ? optionCard.blocked : optionCard.rest;
}
