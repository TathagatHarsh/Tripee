import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { getViewerEmail, requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatINR, formatIST } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { btn, eyebrow } from "@/lib/ui";

/**
 * The account, kept to what an account here actually is.
 *
 * Deliberately not a dashboard. This product's real account has always been the
 * order reference — the bakery rings the number on the docket, and nothing about
 * that changes because somebody signed in. So this is one sheet: who you are,
 * what you have ordered on this account, and the way out.
 *
 * It is also where a refused staff request lands. `requireRole` sends anybody
 * holding a session without the rank to `?denied=…`, and this is the only screen
 * that already knows who they are signed in as and already offers the single
 * thing that fixes it. A dedicated "wrong account" page would be a second page
 * saying what this one says.
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

  const [{ denied }, email] = await Promise.all([searchParams, getViewerEmail()]);
  const refusal = denied ? REFUSED[denied] : undefined;

  const orders = hasDatabase()
    ? await db.order.findMany({
        where: { userId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { ref: true, status: true, totalPaise: true, createdAt: true },
      })
    : [];

  const portal = profile.role === "CUSTOMER" ? null : PORTAL[profile.role];

  return (
    <div className="flex min-h-dvh flex-col bg-slab px-4 py-10 sm:py-16">
      <main id="main" className="mx-auto flex w-full max-w-[36rem] flex-col gap-4">
        <div className="paper-edge bg-paper">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule px-6 py-4">
            <Link href="/" className="font-mono text-item font-medium tracking-[0.2em] uppercase">
              Makemycake
            </Link>
            <span className="font-mono text-micro tracking-[0.14em] text-steel uppercase">
              Account
            </span>
          </div>

          <div className="flex flex-col gap-6 px-6 py-6">
            {/* A div, not a <header>: nested in <main> it would still expose a
                second `banner` landmark, and the <h1> below is the semantics. */}
            <div className="flex flex-col gap-1.5">
              <h1 className="font-mono text-mono-lg leading-mono-lg tracking-mono-lg text-ink uppercase">
                {profile.name ?? "Your account"}
              </h1>
              {email && <p className="font-mono text-meta text-steel">{email}</p>}
            </div>

            {/* Why they are looking at this page rather than the one they asked
                for. First, because it is the reason they are here. */}
            {refusal && (
              <p
                role="alert"
                className="border-l-2 border-seal bg-counter px-3.5 py-3 font-sans text-body leading-snug text-ink"
              >
                {email ? (
                  <>
                    You&apos;re signed in as{" "}
                    <span className="font-mono text-meta">{email}</span>, and that account{" "}
                    {refusal}
                  </>
                ) : (
                  <>That account {refusal}</>
                )}{" "}
                Sign out below to use a different one.
              </p>
            )}

            {/*
              A customer is never told they are a "CUSTOMER". It is the default,
              it grants nothing they would notice, and printing an internal enum
              at somebody is jargon pretending to be information. A role is only
              named when it opens a door, and then it is named as the door.
            */}
            {portal && (
              <div className="flex flex-col gap-2 border border-rule bg-counter px-4 py-3.5">
                <span className={eyebrow}>Staff access</span>
                <Link href={portal.href} className="font-mono text-body text-ink hover:underline">
                  {portal.label} →
                </Link>
              </div>
            )}

            <section className="flex flex-col gap-3">
              <h2 className={eyebrow}>Orders on this account</h2>

              {orders.length === 0 ? (
                <p className="font-sans text-body leading-relaxed text-steel">
                  Nothing yet — or nothing placed while signed in. An order placed as a guest stays
                  a guest order and is tracked by its reference, not by this page.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {orders.map((o) => (
                    <li
                      key={o.ref}
                      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-rule py-3 first:border-t-0 first:pt-0"
                    >
                      <span className="font-mono text-meta tracking-[0.06em] text-carbon">
                        {o.ref}
                      </span>
                      <span className="font-sans text-meta text-steel">
                        {formatIST(o.createdAt)}
                      </span>
                      <span className="ml-auto font-mono text-meta tabular-nums text-ink">
                        {formatINR(o.totalPaise)}
                      </span>
                      <span className="w-full font-sans text-meta text-steel">
                        {STATUS_LABEL[o.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap gap-3 border-t border-rule pt-5">
              <Link href="/build/shape" className={btn("secondary", "md")}>
                Build another
              </Link>
              {/*
                Clerk's own control rather than a server action calling its API:
                it ends the session at Clerk as well as in this browser, which is
                the difference between a shared counter tablet being signed out
                and merely looking signed out.
              */}
              <SignOutButton redirectUrl="/">
                <button type="button" className={btn("quiet", "md", "ml-auto")}>
                  Sign out
                </button>
              </SignOutButton>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
