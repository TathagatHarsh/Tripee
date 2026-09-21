"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/admin/icons";

/**
 * Two tabs, and the one you are on.
 *
 * A client component for exactly one reason — `usePathname`, to mark the current
 * tab — and it costs the bundle a router hook and an array of two. The admin's
 * sidebar made the same trade for the same reason and documents it at length.
 *
 * ## Why a tab bar rather than the sidebar the admin has
 *
 * Two destinations. A 240px column of navigation beside two links would spend a
 * fifth of a tablet's width saying "there are two pages", and on the phone this
 * is often read on it would be a drawer somebody has to open to find out the
 * same thing. §7 asks for extremely simple, and two tabs across the top is the
 * simplest thing that still says where you are.
 *
 * ## The current tab is marked three ways
 *
 * `aria-current="page"`, an underline in the accent colour, and a weight change.
 * Three, because §42 is explicit that status must not be carried by colour
 * alone, and because this bar is read in a kitchen where the screen is often at
 * an angle and washed out by a window.
 *
 * `min-h-12` on the links. This is a thumb with flour on it.
 */

const TABS = [
  { href: "/vendor", label: "Kitchen", icon: "kitchen" },
  { href: "/vendor/orders", label: "Orders", icon: "orders" },
] as const;

export function VendorTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Your bakery" className="mx-auto max-w-5xl px-4 sm:px-6">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          /*
           * Kitchen is an exact match and Orders is a prefix. /vendor is a
           * prefix of every route in this portal, so matching it loosely would
           * light both tabs at once on an order's detail page — and a tab bar
           * with two current tabs has stopped saying where you are.
           */
          const current =
            tab.href === "/vendor"
              ? pathname === "/vendor"
              : pathname.startsWith(tab.href);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={[
                  "flex min-h-12 items-center gap-2 border-b-2 px-3",
                  "font-a-sans text-a-body transition-colors duration-[var(--dur-ui)]",
                  current
                    ? "border-a-accent font-semibold text-a-ink"
                    : "border-transparent font-medium text-a-muted hover:border-a-line-strong hover:text-a-ink",
                ].join(" ")}
              >
                <Icon name={tab.icon} size={17} className="shrink-0" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
