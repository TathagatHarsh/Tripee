import type { Metadata } from "next";
import { ContactLinks, PolicyPage, Section } from "@/components/shop/PolicyPage";
import { getBakeryInfo } from "@/lib/catalogData";

export const metadata: Metadata = {
  title: "Delivery policy · MakeYourCakes",
  description: "Where MakeYourCakes delivers, the delivery windows, pickup, and looking after your cake.",
};

const UPDATED = "4 November 2026";

/**
 * Delivery and pickup.
 *
 * No window times or prices are printed here: they are rows the owner edits at
 * /admin/delivery, and checkout shows the live ones for the customer's pin and
 * date. Hyderabad is the service area (SERVICE_AREA, lib/coverage). The pickup
 * and tracking wording follows lib/orders' PICKUP_STATUS and the order page;
 * the storage advice is the docket's HANDLING block (lib/docket).
 */
export default async function ShippingPolicyPage() {
  const bakery = await getBakeryInfo();

  return (
    <PolicyPage
      bakery={bakery}
      eyebrow="Delivery"
      title="Delivery policy"
      intro={<>We deliver fresh cakes across Hyderabad, or you can collect from the bakery. We do not ship anywhere else. Last updated {UPDATED}.</>}
    >
      <Section title="Where we deliver">
        <p>
          We deliver within Hyderabad. At checkout you drop a pin on your address, and we tell you
          straight away whether we can deliver there and which delivery windows are open for it.
        </p>
      </Section>

      <Section title="Delivery windows and charges">
        <ul>
          <li>Checkout shows the windows available for your address and date, such as a standard daytime window, a same-day evening window, express delivery and midnight delivery, each with its price.</li>
          <li>Every cake needs time to bake and decorate, so checkout only offers dates and windows we can meet.</li>
          <li>The delivery charge is shown before you place the order and is included in your total.</li>
        </ul>
      </Section>

      <Section title="Collecting from the bakery">
        <p>
          Choose pickup at checkout to collect your cake for free. We share the bakery&rsquo;s address
          once a bakery takes your order, and your order page says <em>Ready to collect</em> when the
          cake is boxed and waiting. Bring your order number (it starts with MC-).
        </p>
      </Section>

      <Section title="Following your order">
        <p>
          Your order page shows each step as it happens: confirmed, in the kitchen, out for delivery
          (or ready to collect), and delivered (or collected).
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
