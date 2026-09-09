import Link from "next/link";
import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { getViewerEmail, requireAdmin } from "@/lib/auth";
import { btn, eyebrow } from "@/lib/ui";

/**
 * The admin shell.
 *
 * Deliberately the same paper the customer sees rather than a dark "dashboard"
 * skin: this is the same document from the other side of the counter, and a
 * bakery that recognises its own product in the tool is a bakery that trusts
 * what the tool tells it. Mono, no radius, hairline rules — the rest of the
 * site's rules apply here too.
 *
 * Kitchen is linked but not nested. /kitchen is where a shift works; it is a
 * different job on the same orders, not a section of this one. The link is
 * always live because ADMIN outranks KITCHEN — see lib/roles' ROLE_RANK, and
 * the reason it is a rank: the person who reprices the menu is also the person
 * who moves a docket when the counter is busy. A baker following the same link
 * the other way lands on /login and is told, in words, that the admin portal is
 * the owner's.
 *
 * ## The gate
 *
 * `requireAdmin()` here rather than only in proxy.ts, and this is the gate that
 * counts. A layout runs for this page and every page nested under it, on the
 * server, on every request, and — unlike a proxy — there is no header anybody
 * can send that skips it. proxy.ts turns guests away early and keeps the
 * session cookie fresh; this decides.
 *
 * It does NOT cover the writes. A Server Action posts to the route it lives on
 * but does not re-run its layout, so every action in ./actions.ts carries its
 * own `requireAdmin()`. Two lines of apparent duplication, and removing either
 * one opens something.
 */

export const metadata: Metadata = {
  title: "Admin — Makemycake",
  robots: { index: false, follow: false },
};

/**
 * Five sections, not the seven the brief sketched.
 *
 * Pricing and Availability are not their own screens because they are not their
 * own decisions: what a filling costs and whether it is on today are two fields
 * on the same row, and splitting them would mean finding the ganache twice.
 */
const TABS = [
  { href: "/admin", label: "Today" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/catalog", label: "Catalogue" },
  { href: "/admin/delivery", label: "Delivery" },
  { href: "/admin/settings", label: "Bakery" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // First statement, and never inside a try: this refuses by throwing.
  await requireAdmin();
  const email = await getViewerEmail();

  return (
    <div className="min-h-dvh bg-paper">
      {/* `print:hidden` for /admin/orders/[ref]/print, which is a document
          rather than a screen: nav tabs and a sign-out button on a sheet a
          rider carries are ink spent on controls nobody can press. */}
      <header className="border-b border-rule-strong print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-4 sm:px-8">
          <span className={eyebrow}>Makemycake</span>
          <nav aria-label="Admin sections" className="flex flex-wrap gap-x-5 gap-y-1">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="font-mono text-meta uppercase tracking-[0.1em] text-graphite hover:text-ink"
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/kitchen"
            className="ml-auto font-mono text-micro uppercase tracking-[0.1em] text-steel hover:text-ink"
          >
            Kitchen board →
          </Link>

          {/* Who is holding this session, and how to stop. On a shared office
              machine the first half is the half that matters. */}
          <span className="font-mono text-micro tracking-[0.1em] text-steel">{email}</span>
          <SignOutButton redirectUrl="/">
            <button type="button" className={btn("quiet", "md", "text-micro tracking-[0.1em] uppercase")}>
              Sign out
            </button>
          </SignOutButton>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
