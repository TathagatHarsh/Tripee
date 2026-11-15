"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/admin/icons";

/** Marks the current tab by aria-current, an accent bar and weight: never colour alone. usePathname is why this is a client component. */

const TABS = [
  { href: "/vendor", label: "Home", icon: "kitchen" },
  { href: "/vendor/orders", label: "Orders", icon: "orders" },
  { href: "/vendor/inventory", label: "Cakes", icon: "cake" },
  { href: "/vendor/profile", label: "Profile", icon: "vendor" },
] as const;

/** Fixed to the bottom of the screen below `sm` (thumb reach), a plain bar above it. Orders waits for approval. */
export function VendorTabs({ active }: { active: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => active || t.href !== "/vendor/orders");

  return (
    <nav
      aria-label="Your bakery"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-a-line bg-a-surface pb-[env(safe-area-inset-bottom)] sm:static sm:border-b sm:border-t-0 sm:pb-0"
    >
      <ul className="mx-auto flex max-w-[90rem] sm:gap-1 sm:px-6">
        {tabs.map((tab) => {
          const current =
            tab.href === "/vendor"
              ? pathname === "/vendor"
              : pathname.startsWith(tab.href);

          return (
            <li key={tab.href} className="flex-1 sm:flex-none">
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={[
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-2 px-3 sm:min-h-12 sm:flex-row sm:gap-2 sm:border-b-2 sm:border-t-0",
                  "font-a-sans text-a-meta sm:text-a-body transition-colors duration-[var(--dur-ui)]",
                  current
                    ? "border-a-accent bg-a-accent-wash font-semibold text-a-accent-ink sm:bg-transparent sm:text-a-ink"
                    : "border-transparent font-medium text-a-muted hover:text-a-ink",
                ].join(" ")}
              >
                <Icon name={tab.icon} size={19} className="shrink-0" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
