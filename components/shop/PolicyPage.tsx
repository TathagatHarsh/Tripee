import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import type { BakeryInfo } from "@/lib/catalogSnapshot";
import { sEyebrow } from "@/lib/shopUi";

/**
 * The frame every policy page shares: the shop's header and footer, an eyebrow,
 * a title, one introductory paragraph, then sections. The pages themselves hold
 * only their words, so the five of them cannot drift into five layouts.
 */
export function PolicyPage({
  bakery,
  eyebrow,
  title,
  intro,
  children,
}: {
  bakery: BakeryInfo;
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
          <article className="flex max-w-[46rem] flex-col gap-10">
            <header className="flex flex-col items-start gap-4">
              <span className={sEyebrow}>{eyebrow}</span>
              <h1 className="text-[2.5rem] leading-[1.05] sm:text-[3.25rem]">{title}</h1>
              <p className="max-w-[60ch] text-[1.125rem] leading-relaxed text-s-bark">{intro}</p>
            </header>
            {children}
          </article>
        </div>
      </main>

      <ShopFooter bakery={bakery} />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 text-[1.0625rem] leading-relaxed text-s-bark [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
      <h2 className="text-[1.5rem] text-s-cocoa sm:text-[1.75rem]">{title}</h2>
      {children}
    </section>
  );
}

/** A tappable phone number and email, for the sections that say "get in touch". */
export function ContactLinks({ bakery }: { bakery: BakeryInfo }) {
  const link = "w-fit break-all underline decoration-s-line underline-offset-4 hover:decoration-s-bark";
  return (
    <>
      <a href={`tel:${bakery.phone.replace(/\s/g, "")}`} className={link}>{bakery.phone}</a>
      {" or "}
      <a href={`mailto:${bakery.email}`} className={link}>{bakery.email}</a>
    </>
  );
}
