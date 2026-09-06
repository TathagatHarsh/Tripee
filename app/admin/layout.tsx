import Link from "next/link";
import type { Metadata } from "next";
import { eyebrow } from "@/lib/ui";

/**
 * The admin shell.
 *
 * Deliberately the same paper the customer sees rather than a dark "dashboard"
 * skin: this is the same document from the other side of the counter, and a
 * bakery that recognises its own product in the tool is a bakery that trusts
 * what the tool tells it. Mono, no radius, hairline rules — the rest of the
 * site's rules apply here too.
 *
 * Kitchen is linked but not nested. /kitchen is where a shift works and it has
 * its own credential; putting it inside this nav would imply one login opens
 * both, which is exactly what proxy.ts is arranged to prevent.
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule-strong">
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
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
