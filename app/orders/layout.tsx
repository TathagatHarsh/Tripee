import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { getBakeryInfo } from "@/lib/catalogData";

/**
 * The chrome every state of this area shares.
 *
 * Here rather than in the pages so that the bar and the column survive the four
 * states a route has: the page, its `loading.tsx`, its `error.tsx` and its
 * `not-found.tsx`. A skeleton that also had to draw the header would be a second
 * copy of the header, and the one thing a loading state must not do is move the
 * furniture when the content lands.
 *
 * ## Why this is the shop's header now, and not CustomerNav
 *
 * `<CustomerNav>` was built for a two-page account area — Account, Orders, Sign
 * out — at a time when the shopfront's own bar was a selling bar full of
 * marketing sections. That reasoning does not survive the storefront redesign:
 * the shop's header carries the cart, the search and the categories a customer
 * on this page is one click from wanting, and `<AccountMenu>` inside it already
 * holds Account, My orders and Sign out — every destination CustomerNav had.
 * Two navigation systems for one signed-in customer is the thing to avoid, and
 * this is the one that can reach the whole shop.
 *
 * CustomerNav is not deleted: /account still renders it, and /account keeps the
 * editorial dress this phase did not redesign.
 *
 * No guard here. The refusal lives in each page's `requireRole("CUSTOMER")`,
 * next to the query it protects — a layout is not a gate, for the reason
 * proxy.ts spells out at length: authorisation belongs as close to the data as
 * it can get. app/admin's layout does hold its own guard, and that is because
 * every page beneath it reads staff-only rows; here the pages read the viewer's
 * own, filtered by their own id.
 */
export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  /* Only for the footer's address and hours, which come from the row the owner
     edits at /admin/settings rather than being typed into a template. It is the
     same `unstable_cache`d snapshot every other page on the shop reads. */
  const bakery = await getBakeryInfo();

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />
      <main
        id="main"
        className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12"
      >
        {children}
      </main>
      <ShopFooter bakery={bakery} />
    </div>
  );
}
