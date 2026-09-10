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
      className="paper-edge group flex min-h-[6.5rem] items-start gap-4 bg-paper px-5 py-5 transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)] hover:bg-counter"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-graphite transition-colors duration-[var(--dur-ui)] group-hover:text-ink"
      >
        {glyph}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-sans text-item leading-tight text-ink">{title}</span>
        <span className="font-sans text-meta leading-relaxed text-steel">{blurb}</span>
        {/* Under the blurb rather than beside the title. Beside it, "1 in
            progress" and a title competed for the same line and the title lost
            — "Your orders" wrapped after one word inside a card with room to
            spare. This is a fact about the section, so it reads last. */}
        {meta && (
          <span className="mt-1 font-mono text-micro tracking-[0.08em] tabular-nums text-carbon uppercase">
            {meta}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        className="mt-0.5 font-mono text-body text-steel transition-colors duration-[var(--dur-ui)] group-hover:text-ink"
      >
        →
      </span>
    </Link>
  );
}
