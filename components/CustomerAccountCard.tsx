import Link from "next/link";

/**
 * One thing you can go and do with your account.
 *
 * A card is a link and nothing else — no button inside it, no second action in
 * the corner. The whole surface is the target, which is what makes these work on
 * a phone, and it is why the arrow is decorative rather than a control of its
 * own.
 *
 * ## What is deliberately not offered
 *
 * Only sections that exist. There is no "Addresses" card, because the Order
 * model has no address column — the bakery takes it on the confirmation call —
 * and no "Payment methods", because `PaymentStatus` defaults to `none` and this
 * product takes no money on the site yet. A card that opens an empty page or,
 * worse, a form that saves nowhere, is the thing that makes an account centre
 * feel like a prototype. When Razorpay lands, the card lands with it.
 */
export function CustomerAccountCard({
  href,
  title,
  blurb,
  glyph,
  meta,
}: {
  href: string;
  title: string;
  blurb: string;
  /** A 24×24 line drawing. Drawn at the call site — there is no icon set here. */
  glyph: React.ReactNode;
  /** An optional fact worth putting on the face of the card, e.g. a count. */
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className={
        "group flex min-h-[6.5rem] items-start gap-4 rounded-s border border-s-line " +
        "bg-s-shell px-5 py-5 shadow-[var(--shadow-s-card)] " +
        "transition-[background-color,border-color,box-shadow,translate] " +
        "duration-[var(--dur-ui)] ease-[var(--ease-out)] " +
        "hover:border-s-line-strong hover:shadow-[var(--shadow-s-lift)] " +
        "motion-safe:hover:-translate-y-0.5"
      }
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-s-berry"
      >
        {glyph}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[1.0625rem] leading-tight font-medium text-s-cocoa">{title}</span>
        <span className="text-[0.875rem] leading-relaxed text-s-bark">{blurb}</span>
        {/* Under the blurb rather than beside the title. Beside it, "1 in
            progress" and a title competed for the same line and the title lost
            — "Your orders" wrapped after one word inside a card with room to
            spare. This is a fact about the section, so it reads last. */}
        {meta && (
          <span className="mt-1.5 inline-flex w-fit items-center rounded-full bg-s-berry-wash px-2.5 py-1 font-mono text-[0.6875rem] tracking-[0.08em] text-s-berry uppercase tabular-nums">
            {meta}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        className="mt-0.5 font-mono text-[0.9375rem] text-s-bark transition-[color,translate] duration-[var(--dur-ui)] group-hover:text-s-berry motion-safe:group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
