import Image from "next/image";
import { customPoster, customSrc, likeThisEnquiry, whatsappHref, type CustomCake } from "@/lib/customCakes";

/**
 * One piece of the bakery's custom work, with a WhatsApp link that names it.
 * The `id` makes /custom-cakes#<id> land on it, which is the link the
 * pre-filled message carries so the bakery sees which cake was meant.
 *
 * Videos are muted, looping and inline, the way a phone already plays them,
 * with `controls` so anyone can pause one (WCAG 2.2.2).
 */
export function CustomCakeTile({ cake, phone, sizes }: { cake: CustomCake; phone: string; sizes: string }) {
  const href = whatsappHref(phone, likeThisEnquiry(cake));
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
      {href && (
        <figcaption>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-s-cocoa underline decoration-s-line underline-offset-4 hover:decoration-s-cocoa"
          >
            <span className="sm:hidden">Ask for this cake</span>
            <span className="hidden sm:inline">Ask for a cake like this</span>
            <span aria-hidden>&nbsp;↗</span>
          </a>
        </figcaption>
      )}
    </figure>
  );
}
