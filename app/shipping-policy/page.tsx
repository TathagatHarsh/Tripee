import type { Metadata } from "next";
import { ContactLinks, PolicyPage, Section } from "@/components/shop/PolicyPage";
import { getBakeryInfo, tryCatalogSnapshot } from "@/lib/catalogData";
import { DEFAULT_DELIVERY_RULES } from "@/lib/deliveryRules";

export const metadata: Metadata = {
  title: "Delivery policy · MakeYourCakes",
  description: "Where MakeYourCakes delivers, delivery times, and looking after your cake.",
};

const UPDATED = "9 November 2026";

/** Minutes as hours for prose: 120 -> "2", 90 -> "1.5". */
const hours = (m: number) => String(Math.round((m / 60) * 100) / 100);

/**
 * Delivery and pickup. The delivery times and fee are read from the catalogue's
 * delivery rules (admin Delivery rules form), never hard-coded. Hyderabad is
 * the service area (SERVICE_AREA, lib/coverage). The pickup and tracking
 * wording follows lib/orders' PICKUP_STATUS and the order page; the storage
 * advice is the docket's HANDLING block (lib/docket).
 */
export default async function ShippingPolicyPage() {
  const bakery = await getBakeryInfo();
  const r = (await tryCatalogSnapshot())?.deliveryRules ?? DEFAULT_DELIVERY_RULES;

  return (
    <PolicyPage
      bakery={bakery}
      eyebrow="Delivery"
      title="Delivery policy"
      intro={<>We deliver fresh cakes across Hyderabad. We do not ship anywhere else, and collection from the bakery is not available at the moment. Last updated {UPDATED}.</>}
    >
      <Section title="Where we deliver">
        <p>
          We deliver within Hyderabad. At checkout you drop a pin on your address, and we tell you
          straight away whether we can deliver there.
        </p>
      </Section>

      <Section title="Delivery times and charges">
        <ul>
          <li>We take orders {r.ordersFrom}–{r.ordersUntil}, every day.</li>
          <li>Ready-made cakes arrive in {hours(r.readyMinMinutes)}–{hours(r.readyMaxMinutes)} hours; custom cakes in {hours(r.customMinMinutes)}–{hours(r.customMaxMinutes)} hours.</li>
          <li>You can also schedule a {hours(r.windowMinutes)}-hour window up to {r.preorderDays} days ahead.</li>
          <li>Delivery is a flat ₹{r.feePaise / 100}, shown before you place the order and included in your total.</li>
        </ul>
      </Section>

      <Section title="Following your order">
        <p>
          Your order page shows each step as it happens: confirmed, in the kitchen, out for delivery,
          and delivered.
        </p>
      </Section>

      <Section title="Receiving your cake">
        <ul>
          <li>Please make sure someone is there to receive the cake during your delivery window, and keep the phone number on the order reachable.</li>
          <li>If our rider cannot reach anyone, we call the number on the order to arrange what to do.</li>
          <li>Check the cake when it arrives. If it is damaged or not what you ordered, see the cancellation and refund policy.</li>
        </ul>
      </Section>

      <Section title="Looking after your cake">
        <p>
          Put the cake in the fridge, in its box, as soon as it arrives. Take it out about 20 minutes
          before serving, and eat it within a day.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          For anything about a delivery, call or email us on <ContactLinks bakery={bakery} /> with
          your order number.
        </p>
      </Section>
    </PolicyPage>
  );
}
