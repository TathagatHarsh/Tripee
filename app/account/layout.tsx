import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { getBakeryInfo } from "@/lib/catalogData";

/**
 * The chrome the account centre shares with its own loading and error states,
 * and with the Clerk-hosted profile beneath it.
 *
 * ## Why this is the shop's header now, and not CustomerNav
 *
 * The same argument app/orders/layout.tsx makes, and the two had to move
 * together or not at all: an account area on cream behind a cool-grey bar, one
 * click from an orders area on cream behind the shop's bar, is worse than
 * either consistency on its own. `<AccountMenu>` inside the shop header already
 * carries every destination CustomerNav had — Account, My orders, Sign out —
 * and adds the cart, the search and the categories, which is what somebody who
 * has just finished with their password actually wants next.
 *
 * `components/CustomerNav.tsx` is left in the tree, unrendered. It is not dead
 * by accident and it is not deleted by accident either — see the note at the
 * top of that file.
 *
 * No guard here, for the reason app/orders/layout.tsx gives: the refusal
 * belongs beside the data, and every page under this one calls
 * `requireRole("CUSTOMER")` as its first statement.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  /* Only for the footer's address and hours, which come from the row the owner
     edits at /admin/settings rather than being typed into a template. The same
     `unstable_cache`d snapshot every other page on the shop reads. */
  const bakery = await getBakeryInfo();

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />
      <main
        id="main"
        className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12"
      >
        {children}
      </main>
      <ShopFooter bakery={bakery} />
    </div>
  );
}
