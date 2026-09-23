import Link from "next/link";
import type { BakeryInfo } from "@/lib/catalogSnapshot";
import { CAKE_CATEGORIES } from "@/lib/cakes";

/**
 * The foot of the shop.
 *
 * Every fact in the contact column comes from `catalog.bakery` — the row the
 * owner edits at /admin/settings — rather than being typed here, for the reason
 * the old landing page gave about lead times: a marketing page that hardcodes a
 * phone number is a page that keeps printing last year's phone number. The
 * FSSAI line appears only when `NEXT_PUBLIC_FSSAI_LICENCE` is set, which is the
 * policy lib/docket already holds: a licence number nobody has entered is not a
 * licence number to print.
 *
 * The link columns list pages that exist. There is no /contact and no /policies
 * route in this application, so this does not link to them — a footer full of
 * 404s is worse than a short footer.
 */
export function ShopFooter({ bakery }: { bakery: BakeryInfo }) {
  return (
    <footer className="border-t border-s-line bg-s-cocoa-deep text-s-cream/85">
      <div className="mx-auto grid max-w-[84rem] gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-10">
        <div className="flex flex-col gap-3">
          <span className="font-display text-[1.5rem] text-s-cream">MakeYourCakes</span>
          <p className="max-w-[34ch] text-[0.9375rem] leading-relaxed text-s-cream/70">
            One bakery in Jubilee Hills, Hyderabad. Every cake is baked to the
            order it was quoted from.
          </p>
        </div>

        <nav aria-label="Shop">
          <h2 className="mb-3 font-mono text-[0.6875rem] tracking-[0.16em] text-s-cream/60 uppercase">
            Shop
          </h2>
          <ul className="flex flex-col gap-0.5">
            <FootLink href="/shop">All cakes</FootLink>
            {CAKE_CATEGORIES.slice(0, 4).map((c) => (
              <FootLink key={c.slug} href={`/shop?category=${c.slug}`}>
                {c.name}
              </FootLink>
            ))}
          </ul>
        </nav>

        <nav aria-label="Your account">
          <h2 className="mb-3 font-mono text-[0.6875rem] tracking-[0.16em] text-s-cream/60 uppercase">
            Your account
          </h2>
          <ul className="flex flex-col gap-0.5">
            <FootLink href="/cart">Cart</FootLink>
            <FootLink href="/orders">My orders</FootLink>
            <FootLink href="/account">Account</FootLink>
            <FootLink href="/sign-in">Sign in</FootLink>
          </ul>
        </nav>

        <div>
          <h2 className="mb-3 font-mono text-[0.6875rem] tracking-[0.16em] text-s-cream/60 uppercase">
            Visit &amp; call
          </h2>
          <address className="flex flex-col gap-2 text-[0.9375rem] leading-relaxed text-s-cream/75 not-italic">
            <span>{bakery.address}</span>
            <span>{bakery.hours}</span>
            {/* `tel:` and `mailto:` rather than plain text: on the device most of
                this shop is read on, a phone number that cannot be tapped is a
                phone number that has to be retyped. */}
            <a
              href={`tel:${bakery.phone.replace(/\s/g, "")}`}
              className="w-fit underline decoration-s-cream/30 underline-offset-4 transition-colors hover:text-s-cream hover:decoration-s-cream"
            >
              {bakery.phone}
            </a>
            <a
              href={`mailto:${bakery.email}`}
              className="w-fit break-all underline decoration-s-cream/30 underline-offset-4 transition-colors hover:text-s-cream hover:decoration-s-cream"
            >
              {bakery.email}
            </a>
          </address>
        </div>
      </div>

      <div className="border-t border-s-cream/10">
        <div className="mx-auto flex max-w-[84rem] flex-col gap-2 px-4 py-6 font-mono text-[0.75rem] tracking-[0.06em] text-s-cream/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <span>© {new Date().getFullYear()} {bakery.name}</span>
          {bakery.fssaiLicence && <span>FSSAI {bakery.fssaiLicence}</span>}
        </div>
      </div>
    </footer>
  );
}

function FootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center text-[0.9375rem] text-s-cream/75 transition-colors duration-[var(--dur-ui)] hover:text-s-cream"
      >
        {children}
      </Link>
    </li>
  );
}
