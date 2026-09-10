import Link from "next/link";
import type { Metadata } from "next";
import { CustomerAccountCard } from "@/components/CustomerAccountCard";
import { getViewerEmail, requireRole } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { eyebrow } from "@/lib/ui";
import { countByPhase } from "@/app/orders/data";

/**
 * The account centre.
 *
 * ## What changed, and why it had to
 *
 * This page used to be the whole customer product: a greeting, the staff door,
 * and the entire order history as a list of four-column rows with a status
 * printed in grey under each. That conflated two jobs. Somebody checking where
 * their cake is does not want an account page, and somebody changing their
 * password does not want to scroll past six orders to find the way to do it. So
 * the orders moved to their own area at /orders, with search, tabs and a
 * tracking page each, and what is left here is what an account actually is:
 * who you are, how you sign in, and one clearly marked way through to the
 * orders.
 *
 * ## Only doors that open
 *
 * There is no "Addresses" card and no "Payment methods" card, and neither is an
 * oversight. `Order` has no address column — the bakery takes the address on the
 * confirmation call, which is what the `draft` state is for — and
 * `PaymentStatus` defaults to `none` because this product takes no money on the
 * site yet. Cards for either would open a page with nothing behind it, and an
 * account centre made of dead ends is worse than a short one.
 *
 * It is also still where a refused staff request lands. `requireRole` sends
 * anybody holding a session without the rank to `?denied=…`, and this is the one
 * screen that already knows who they are signed in as and already offers the
 * only fix, which is to sign out and sign in as somebody else.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account — Makemycake",
  robots: { index: false, follow: false },
};

/** The two portals, for the two roles that have one. */
const PORTAL = {
  KITCHEN: { href: "/kitchen", label: "Kitchen board" },
  ADMIN: { href: "/admin", label: "Admin portal" },
} as const;

/** What each shut door is, in a sentence somebody can act on. */
const REFUSED: Record<string, string> = {
  admin: "doesn't open the admin portal. Prices and the catalogue are the owner's account.",
  kitchen: "doesn't open the kitchen board. That one is for the bakers' accounts.",
};

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  // First statement, and never inside a try: this refuses by throwing.
  const { profile } = await requireRole("CUSTOMER");

  const [{ denied }, email, counts] = await Promise.all([
    searchParams,
    getViewerEmail(),
    /*
     * The one number on this page, and the only reason it touches the database
     * at all. A count is a cheap GROUP BY on an indexed column and it is what
     * turns "Your orders" from a link into a fact — "2 in progress" is the
     * sentence a returning customer is looking for. The list itself is not
     * fetched here; that is /orders' job, and fetching twenty rows to render a
     * card that shows none of them is the sort of thing that makes an account
     * page slow for nothing.
     */
    hasDatabase() ? countByPhase(profile.id) : null,
  ]);

  const refusal = denied ? REFUSED[denied] : undefined;
  const portal = profile.role === "CUSTOMER" ? null : PORTAL[profile.role];

  const ordersMeta = counts
    ? counts.all === 0
      ? "None yet"
      : counts.active > 0
        ? `${counts.active} in progress`
        : `${counts.all} ${counts.all === 1 ? "order" : "orders"}`
    : undefined;

  return (
    <>
      {/* No "ACCOUNT" eyebrow over this one. The bar already marks which area
          this is, and the two card groups below are labelled ORDERS and ACCOUNT
          — a third use of the same word directly above them was chrome
          repeating itself. */}
      <div className="flex flex-col gap-2">
        <h1 className="font-mono text-heading text-ink">
          {/* Their own name, from a field they set themselves — and no
              fabricated greeting when there is none. */}
          {profile.name ? `Hello, ${profile.name}` : "Your account"}
        </h1>
        <p className="max-w-[56ch] font-sans text-lede leading-relaxed text-steel">
          Your details, how you sign in, and every cake you have ordered while
          signed in.
        </p>
        {email && <p className="font-mono text-meta text-steel">{email}</p>}
      </div>

      {/* Why they are looking at this page rather than the one they asked for.
          First, because it is the reason they are here. */}
      {refusal && (
        <p
          role="alert"
          className="border-l-2 border-seal bg-counter px-4 py-3.5 font-sans text-body leading-relaxed text-ink"
        >
          {email ? (
            <>
              You&apos;re signed in as <span className="font-mono text-meta">{email}</span>, and
              that account {refusal}
            </>
          ) : (
            <>That account {refusal}</>
          )}{" "}
          Sign out at the top of this page to use a different one.
        </p>
      )}

      <Group title="Orders">
        <CustomerAccountCard
          href="/orders"
          title="Your orders"
          blurb="Track a cake through the kitchen, or look up something you ordered before."
          meta={ordersMeta}
          glyph={<BoxGlyph />}
        />
      </Group>

      <Group title="Account">
        <CustomerAccountCard
          href="/account/profile"
          title="Profile & personal information"
          blurb="Your name and email address, as they appear on an order."
          glyph={<PersonGlyph />}
        />
        <CustomerAccountCard
          /*
           * Clerk's own component owns every path under /account/profile — see
           * that page's catch-all segment — so this deep link lands on its
           * security panel without a second page of ours to maintain. It cannot
           * 404: the catch-all answers every sub-path.
           */
          href="/account/profile/security"
          title="Login & security"
          blurb="Password, connected sign-in methods and the devices you are signed in on."
          glyph={<LockGlyph />}
        />
      </Group>

      {/*
        A customer is never told they are a "CUSTOMER". It is the default, it
        grants nothing they would notice, and printing an internal enum at
        somebody is jargon pretending to be information. A role is only named
        when it opens a door, and then it is named as the door.
      */}
      {portal && (
        <Group title="Staff access">
          <div className="paper-edge flex flex-col gap-2 bg-paper px-5 py-5">
            <Link
              href={portal.href}
              className="font-mono text-item tracking-[0.06em] text-ink hover:underline"
            >
              {portal.label} →
            </Link>
            <p className="font-sans text-meta leading-relaxed text-steel">
              This account also opens the bakery&apos;s own board. Your orders above
              are yours as a customer, not the shop&apos;s.
            </p>
          </div>
        </Group>
      )}

      <p className="border-t border-rule pt-5 font-sans text-meta leading-relaxed text-steel">
        You don&apos;t need an account to order a cake. One placed as a guest is
        tracked by the reference on its confirmation rather than by this page —
        ring the bakery with it and they will pull it up.{" "}
        <Link href="/build/shape" className="border-b border-rule-strong text-ink hover:border-ink">
          Build another
        </Link>
        .
      </p>
    </>
  );
}

/** A named group of cards. Two on a tablet upwards, stacked on a phone. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={eyebrow}>{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ glyphs */
/* Drawn rather than imported: there is no icon library in this repository and
   these are a few shapes' worth of path data. 1.25 stroke, to sit with the
   hairline rules rather than on top of them — the same weight the account
   menu's own person glyph uses. */

function PersonGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="8.5" r="3.25" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </Glyph>
  );
}

function LockGlyph() {
  return (
    <Glyph>
      <rect x="4.5" y="10.5" width="15" height="9" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Glyph>
  );
}

function BoxGlyph() {
  return (
    <Glyph>
      <path d="M4 8.5 12 5l8 3.5v7L12 19l-8-3.5z" />
      <path d="M4 8.5 12 12l8-3.5M12 12v7" />
    </Glyph>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
