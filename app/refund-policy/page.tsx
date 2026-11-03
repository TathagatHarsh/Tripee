import type { Metadata } from "next";
import { ContactLinks, PolicyPage, Section } from "@/components/shop/PolicyPage";
import { getBakeryInfo } from "@/lib/catalogData";
import { paymentsEnabled } from "@/lib/razorpay";

export const metadata: Metadata = {
  title: "Cancellation and refund policy · MakeYourCakes",
  description: "When you can cancel a MakeYourCakes order, and how refunds work.",
};

const UPDATED = "4 November 2026";

/**
 * Cancellation and refunds.
 *
 * The line is "until baking starts" because that is a line the customer can
 * see: the order page moves to In the kitchen at that moment (lib/orders). A
 * customer cannot cancel from the website (no such action exists), so this
 * page sends them to the phone and email in the bakery settings. A refund on a
 * cancel is automatic and full (lib/checkoutPayment's refundCancelledOrder).
 * Damaged or wrong cakes are decided case by case, by the owner's choice.
 */
export default async function RefundPolicyPage() {
  const bakery = await getBakeryInfo();
  const online = paymentsEnabled();

  return (
    <PolicyPage
      bakery={bakery}
      eyebrow="Cancellations"
      title="Cancellation and refund policy"
      intro={<>Every cake is baked to order, so what we can do depends on whether baking has started. Last updated {UPDATED}.</>}
    >
      <Section title="Cancelling an order">
        <ul>
          <li><strong>Before baking starts</strong>, you can cancel and get a full refund, or pay nothing if you have not paid yet.</li>
          <li><strong>Once baking has started</strong>, we cannot cancel or refund the order, because the cake is already being made for you. Your order page shows <em>In the kitchen</em> from that moment.</li>
          <li>To cancel, call or email us on <ContactLinks bakery={bakery} /> with your order number (it starts with MC-). You cannot cancel from the website yet.</li>
        </ul>
      </Section>

      <Section title="If we cancel">
        <p>
          If we cannot make or deliver your order, for example because no bakery can make it in time,
          we cancel it and tell you. You pay nothing, and anything you paid is refunded in full.
        </p>
      </Section>

      <Section title="Damaged or wrong cake">
        <p>
          If your cake arrives damaged, or is not what you ordered, contact us within 2 hours of
          delivery or collection on <ContactLinks bakery={bakery} />, with your order number and a
          photo of the cake. We look at each case and put it right as fairly as we can, which may be a
          remake, a partial refund or a full refund.
        </p>
      </Section>

      <Section title="Changing an order">
        <p>
          To change the date, time or address, contact us before baking starts. We will do what we
          can, but a different time or place may not be possible, or may cost more to deliver.
        </p>
      </Section>

      <Section title="How refunds are paid">
        <p>
          {online
            ? "A refund goes back to the card, UPI account or bank you paid with, through Razorpay. It is issued as soon as the cancellation is made; your bank usually takes 5 to 7 working days to show it."
            : "We do not take payment on this website at the moment. If you paid us another way, we refund you the same way, as soon as the cancellation is confirmed."}
        </p>
      </Section>
    </PolicyPage>
  );
}
