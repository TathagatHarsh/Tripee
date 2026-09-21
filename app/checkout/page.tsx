import type { Metadata } from "next";
import { CheckoutForm } from "@/app/checkout/CheckoutForm";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { listCakes } from "@/lib/cakeData";
import { getCatalogSnapshot } from "@/lib/catalogData";

export const metadata: Metadata = {
  title: "Checkout · Makemycake",
  robots: { index: false, follow: false },
};

/**
 * Checkout, and no sign-in wall in front of it.
 *
 * Guest checkout has always worked in this product — `/api/orders` reads the
 * session for itself and writes `userId: null` for a stranger — and this page
 * keeps it that way: there is no `requireRole` here and no redirect. Signing in
 * is what makes an order appear on /orders later, and has never been a
 * condition of buying a cake.
 */
export default async function CheckoutPage() {
  const [catalog, cakes] = await Promise.all([
    getCatalogSnapshot(),
    listCakes(),
  ]);

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <div className="checkout-heading">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[.15em] text-s-berry">
                The finishing touches
              </span>
              <h1>Let’s make their day.</h1>
            </div>
            <ol className="checkout-steps" aria-label="Checkout progress">
              <li>01 Basket</li>
              <li aria-hidden>—</li>
              <li>
                <strong aria-current="step">02 Checkout</strong>
              </li>
              <li aria-hidden>—</li>
              <li>03 Celebration</li>
            </ol>
          </div>
          <CheckoutForm catalog={catalog} cakes={cakes} />
        </div>
      </main>
      <ShopFooter bakery={catalog.bakery} />
    </div>
  );
}
