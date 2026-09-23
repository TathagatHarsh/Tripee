import { PortalAlerts } from "@/components/assignment/PortalAlerts";
import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { getViewerEmail, requireVendor } from "@/lib/auth";
import { VendorTabs } from "./VendorTabs";

/**
 * The partner bakery's portal.
 *
 * The fourth interface in this product, and deliberately the smallest. The admin
 * has a sidebar with four sections and a dozen pages; this has two tabs, because
 * a vendor's whole relationship with MakeYourCakes is "what have you given me, what
 * do I do next with it, and what did I do with the last one". §7: a vendor must
 * not be handed an admin portal with the dangerous pages hidden.
 *
 * ## Two tabs, and why there is no third
 *
 * §7 recommends Kitchen / Orders / Account. The first two are here. The third is
 * not, and the reason is that the only thing behind it would be the email
 * address and the sign-out button already in this header — this portal has no
 * profile, no preferences and no settings a bakery owns. A tab leading to a page
 * containing one button teaches somebody that the navigation overstates how much
 * is in it.
 *
 * The one real alternative was pointing it at /account/profile, and that is
 * worse: /account is the *customer's* area, with the customer's navigation and
 * the customer's order history, and dropping a bakery into it to change a
 * password would be the category error this whole phase exists to fix.
 *
 * ## The palette is the admin's, and that is a decision rather than laziness
 *
 * `a-root` puts this subtree on the grey canvas and the `a-` tokens — the same
 * ones /admin uses. A fourth palette was considered and declined: the admin
 * tokens are already contrast-checked, already have a colour that means "this
 * needs you", and a vendor and an owner looking at the same order should not
 * have to translate between two colour languages when they are on the phone to
 * each other. The kitchen at /kitchen has its own because it is read across a
 * bench at a metre; this is read in a hand at thirty centimetres, which is what
 * the admin palette was built for.
 *
 * What is *not* borrowed from the admin is the density. Every control in here is
 * at least 44px tall and the cards lead with the photograph — §28's
 * "purpose-built kitchen workstation", not a dashboard with the rows made
 * bigger.
 *
 * ## The gate
 *
 * `requireVendor()` here, in a layout, so it runs on the server for this page
 * and every page nested under it on every request — the same arrangement
 * app/admin/layout.tsx has, and for the same reason a proxy is not good enough.
 *
 * It does **two** checks, which is the part that matters: the role, and that the
 * role has a bakery behind it. Everything under this layout queries by that
 * bakery's id and by nothing a request can name. See lib/auth.
 *
 * It does NOT cover the writes. A Server Action does not re-run its layout, so
 * every action in ./actions.ts carries its own `requireVendor()`.
 */

export const metadata: Metadata = {
  title: "Kitchen — MakeYourCakes",
  robots: { index: false, follow: false },
};

/** The board is live work. A cached shell is a shell with this morning's orders. */
export const dynamic = "force-dynamic";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  // First statement, and never inside a try: this refuses by throwing.
  const { vendor, userId } = await requireVendor();
  const email = await getViewerEmail();

  return (
    <div className="a-root vendor-root flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-a-line bg-a-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 sm:px-6">
          <span className="min-w-0 font-a-sans text-a-lede font-bold tracking-[-0.015em] text-a-ink">
            {vendor.name}
          </span>
          {/*
            The one word that says whose screen this is. A vendor signing in and
            seeing a list of cakes with no indication of which bakery they are
            looking at is a vendor who cannot be sure the list is theirs.
          */}
          <span className="font-a-sans text-a-meta uppercase tracking-[0.1em] text-a-faint">
            MakeYourCakes orders
          </span>

          <div className="ml-auto flex items-center gap-3">
            {email && (
              <span className="hidden font-a-mono text-a-meta text-a-faint sm:inline">{email}</span>
            )}
            <SignOutButton redirectUrl="/">
              <button
                type="button"
                className="min-h-11 rounded-a-sm border border-a-line-strong px-3 text-a-meta font-medium text-a-muted transition-colors hover:border-a-ink hover:text-a-ink"
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>

        <VendorTabs />
      </header>

      <main id="main" className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <PortalAlerts role="vendor" userId={userId} />
        {children}
      </main>
    </div>
  );
}
