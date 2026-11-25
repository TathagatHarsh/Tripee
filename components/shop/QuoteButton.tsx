import { connection } from "next/server";
import { cache } from "react";
import { CustomEnquiry } from "@/components/shop/CustomEnquiry";
import { CustomRequestSheet } from "@/components/shop/CustomRequestSheet";
import { getCatalogSnapshot, loadClosedDays } from "@/lib/catalogData";
import { whatsappTo } from "@/lib/customCakes";
import { paymentCheckoutAvailable } from "@/lib/razorpay";
import { hasImageStore } from "@/lib/storage";
import { whatsappConfigured } from "@/lib/whatsapp";

/**
 * What the request form needs, or null when it can't run: it takes WhatsApp, an image store and
 * online payment (a quote must be payable). Cached per request because every gallery tile asks.
 * Only the request form makes a page dynamic (closed days are today's, not the build's).
 */
export const requestSheetData = cache(async () => {
  if (!(whatsappConfigured() && hasImageStore() && paymentCheckoutAvailable())) return null;
  await connection();
  const catalog = await getCatalogSnapshot();
  return { catalog, closedDays: await loadClosedDays(catalog.deliveryRules.preorderDays) };
});

/**
 * "Send us your idea": the one way into a custom-cake quote, on the home page and /custom-cakes.
 *
 * The request form when it can run, so the bakery hears from our WhatsApp number; otherwise a
 * wa.me chat with the bakery; with no WhatsApp number at all, a phone call.
 */
export async function QuoteButton({ phone, className, children }: { phone: string; className: string; children: React.ReactNode }) {
  const sheet = await requestSheetData();
  if (sheet)
    return (
      <CustomRequestSheet {...sheet} buttonClassName={className}>
        {children}
      </CustomRequestSheet>
    );
  const to = whatsappTo(phone);
  if (to)
    return (
      <CustomEnquiry to={to} cakeLink={null} title="Your own cake design" canUpload={hasImageStore()} buttonClassName={className}>
        {children}
      </CustomEnquiry>
    );
  return (
    <a href={`tel:${phone.replace(/\s/g, "")}`} className={className}>
      Call {phone}
    </a>
  );
}
