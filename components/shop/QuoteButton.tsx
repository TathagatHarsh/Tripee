import { connection } from "next/server";
import { CustomEnquiry } from "@/components/shop/CustomEnquiry";
import { CustomRequestSheet } from "@/components/shop/CustomRequestSheet";
import { getCatalogSnapshot, loadClosedDays } from "@/lib/catalogData";
import { whatsappTo } from "@/lib/customCakes";
import { paymentCheckoutAvailable } from "@/lib/razorpay";
import { hasImageStore } from "@/lib/storage";
import { whatsappConfigured } from "@/lib/whatsapp";

/**
 * "Send us your idea": the one way into a custom-cake quote, on the home page and /custom-cakes.
 *
 * With WhatsApp, an image store and online payment the photo goes through our own request form
 * (a quote must be payable); otherwise a wa.me chat; with no WhatsApp number at all, a phone call.
 * Only the request form makes the page dynamic (closed days are today's, not the build's).
 */
export async function QuoteButton({ phone, className, children }: { phone: string; className: string; children: React.ReactNode }) {
  if (whatsappConfigured() && hasImageStore() && paymentCheckoutAvailable()) {
    await connection();
    const catalog = await getCatalogSnapshot();
    const closedDays = await loadClosedDays(catalog.deliveryRules.preorderDays);
    return (
      <CustomRequestSheet catalog={catalog} closedDays={closedDays} buttonClassName={className}>
        {children}
      </CustomRequestSheet>
    );
  }
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
