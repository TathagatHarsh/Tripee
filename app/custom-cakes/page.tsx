import type { Metadata } from "next";
import { CustomCakeTile } from "@/components/shop/CustomCakeTile";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { getBakeryInfo } from "@/lib/catalogData";
import { CUSTOM_CAKES, CUSTOM_GROUPS, whatsappTo } from "@/lib/customCakes";
import { CustomEnquiry } from "@/components/shop/CustomEnquiry";
import { sBtn, sEyebrow } from "@/lib/shopUi";

export const metadata: Metadata = {
  alternates: { canonical: "/custom-cakes" },
  title: "Custom cakes · MakeYourCakes",
  description:
    "Birthday, wedding and celebration cakes made to your idea in Hyderabad. Pick one of ours or send us a photo, and we'll quote it on WhatsApp.",
};

const SIZES = "(min-width:1024px) 22vw, (min-width:640px) 30vw, 46vw";

/**
 * Custom cakes: the bakery's own work, and a way to ask for one.
 *
 * There is no checkout here on purpose. A custom cake is priced by its design,
 * so it is quoted in a WhatsApp chat, which is also where a customer can attach
 * a photo of their own idea: a wa.me link can carry text but not an image, so
 * the photo button opens the chat with a message that says one is coming.
 */
export default async function CustomCakesPage() {
  const bakery = await getBakeryInfo();
  const to = whatsappTo(bakery.phone);

  const sendPhoto = (extra = "") =>
    to ? (
      <CustomEnquiry to={to} cakeLink={null} title="Your own cake design" buttonClassName={sBtn("primary", "lg", extra)}>
        Send us your cake photo <span aria-hidden>↗</span>
      </CustomEnquiry>
    ) : (
      <a href={`tel:${bakery.phone.replace(/\s/g, "")}`} className={sBtn("primary", "lg", extra)}>
        Call {bakery.phone}
      </a>
    );

  return (
    <div className="s-root min-h-dvh bg-s-cream">
      <ShopHeader current="custom-cakes" />
      <main id="main">
        <section className="brand-section">
          <div className="flex max-w-[44rem] flex-col gap-5">
            <span className={sEyebrow}>Custom cakes</span>
            <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.02] tracking-[-0.02em] text-s-cocoa">
              Your idea, <em>baked.</em>
            </h1>
            <p className="text-[1.0625rem] leading-relaxed text-s-bark">
              Every cake on this page was made to someone&rsquo;s idea. Pick one you love, or send us a
              photo of the cake you have in mind, and we will quote it for you on WhatsApp. Low
              sugar, prebiotic and fibre-rich cakes are available too.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {sendPhoto()}
              <a href={`#${CUSTOM_GROUPS[0].id}`} className="inline-flex min-h-14 items-center px-3 text-sm font-semibold underline underline-offset-8">
                See our work
              </a>
            </div>
            <ol className="mt-2 grid gap-3 text-[0.9375rem] text-s-bark sm:grid-cols-3">
              {[
                "Send a photo of your idea, or pick one of ours and tap Ask.",
                "Tell us the date, size, flavour and the message you want on it.",
                "We quote the price and confirm everything with you before we bake.",
              ].map((step, i) => (
                <li key={step} className="flex gap-3 rounded-s border border-s-line bg-s-shell p-4">
                  <span className="font-mono text-s-berry">0{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {CUSTOM_GROUPS.map((group) => (
          <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className="brand-section scroll-mt-20 !pt-0">
            <div className="brand-section-head">
              <div>
                <h2 id={`${group.id}-title`}>{group.title}</h2>
                <p className="mt-2 text-s-bark">{group.blurb}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {CUSTOM_CAKES.filter((c) => c.group === group.id).map((cake) => (
                <CustomCakeTile key={cake.id} cake={cake} phone={bakery.phone} sizes={SIZES} />
              ))}
            </div>
          </section>
        ))}

        <section className="border-t border-s-line bg-s-cocoa-deep text-s-cream">
          <div className="brand-section flex flex-col items-start gap-5">
            <h2 className="font-display text-[clamp(2rem,3.3vw,3.1rem)] leading-tight">Have a design in mind?</h2>
            <p className="max-w-[40rem] text-s-cream/80">
              Send us a photo, a sketch or a screenshot. Tell us the date and how many people it is for,
              and we will come back with a price.
            </p>
            {sendPhoto()}
          </div>
        </section>
      </main>
      <ShopFooter bakery={bakery} />
    </div>
  );
}
