import Image from "next/image";
import { customCakeLink, customPoster, customSrc, whatsappTo, type CustomCake } from "@/lib/customCakes";
import { CustomEnquiry } from "@/components/shop/CustomEnquiry";
import { CustomRequestSheet } from "@/components/shop/CustomRequestSheet";
import { requestSheetData } from "@/components/shop/QuoteButton";

/**
 * One piece of the bakery's custom work, and a way to ask for one like it: the request form with
 * this cake's photo attached (it reaches MakeYourCakes, who quote it on WhatsApp), or, when that can't run,
 * a wa.me chat whose message links the photo. The `id` lets /custom-cakes#<id> land on it.
 *
 * Videos are muted, looping and inline, the way a phone already plays them,
 * with `controls` so anyone can pause one (WCAG 2.2.2).
 */
export async function CustomCakeTile({ cake, phone, sizes }: { cake: CustomCake; phone: string; sizes: string }) {
  const sheet = await requestSheetData();
  const to = whatsappTo(phone);
  const still = { src: cake.video ? customPoster(cake) : customSrc(cake), alt: cake.alt };
  const ask = "inline-flex min-h-11 items-center text-left text-[0.9375rem] font-medium text-s-cocoa underline decoration-s-line underline-offset-4 hover:decoration-s-cocoa";
  const label = (
    <>
      <span className="sm:hidden">Ask for this cake</span>
      <span className="hidden sm:inline">Ask for a cake like this</span>
    </>
  );
  return (
    <figure id={cake.id} className="flex scroll-mt-24 flex-col gap-2">
      <div className="relative aspect-[3/4] overflow-hidden rounded-s bg-s-cream-deep">
        {cake.video ? (
          <video
            src={customSrc(cake)}
            poster={customPoster(cake)}
            aria-label={cake.alt}
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          <Image src={customSrc(cake)} alt={cake.alt} fill sizes={sizes} className="object-cover" />
        )}
      </div>
      {sheet ? (
        <figcaption>
          <CustomRequestSheet {...sheet} preset={still} title="Ask for a cake like this" buttonClassName={ask}>
            {label}
          </CustomRequestSheet>
        </figcaption>
      ) : to && (
        <figcaption>
          <CustomEnquiry to={to} cakeLink={customCakeLink(cake)} thumb={still} title="Ask for a cake like this" buttonClassName={ask}>
            {label}
          </CustomEnquiry>
        </figcaption>
      )}
    </figure>
  );
}
