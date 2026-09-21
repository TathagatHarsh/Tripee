import type { Metadata } from "next";
import { CartView } from "@/app/cart/CartView";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { listCakes } from "@/lib/cakeData";
import { getCatalogSnapshot } from "@/lib/catalogData";

export const metadata: Metadata = {
  title: "Your cart · Makemycake",
  /* A basket is not a page to index, and its contents live in one browser. */
  robots: { index: false, follow: true },
};

export default async function CartPage() {
  /* Fetched here rather than in the client view: the view is a client
     component and cannot read a database, and the alternative — fetching
     /api/catalog after mount — would show every line's price wrong for a beat.
     The cakes come the same way: the basket holds slugs, and the rows behind
     them are what carry the name, the photograph and the price. */
  const [catalog, cakes] = await Promise.all([getCatalogSnapshot(), listCakes()]);

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <h1 className="mb-8 text-[2.25rem] sm:text-[2.75rem]">Your cart</h1>
          <CartView catalog={catalog} cakes={cakes} />
        </div>
      </main>
      <ShopFooter bakery={catalog.bakery} />
    </div>
  );
}
