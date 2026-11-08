import type { Metadata } from "next";
import { ContactLinks, PolicyPage, Section } from "@/components/shop/PolicyPage";
import { getBakeryInfo } from "@/lib/catalogData";
import { paymentsEnabled } from "@/lib/razorpay";

export const metadata: Metadata = {
  title: "Cancellation and refund policy · MakeYourCakes",
  description: "When you can cancel a MakeYourCakes order, and how refunds work.",
};

const UPDATED = "8 November 2026";

/**
 * Cancellation and refunds.
 *
 * The owner's rule: a customer may cancel within 30 minutes of placing the
 * order, and we refund when we cannot deliver to their address. A customer
 * cannot cancel from the website (no such action exists), so this
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
      intro={<>Every cake is baked to order, so you can cancel for a full refund within 30 minutes of placing your order. Last updated {UPDATED}.</>}
    >
      <Section title="Cancelling an order">
        <ul>
          <li><strong>Within 30 minutes of placing your order</strong>, you can cancel and get a full refund, or pay nothing if you have not paid yet.</li>
          <li><strong>After 30 minutes</strong>, we cannot cancel or refund the order, because we may already be making your cake.</li>
          <li>To cancel, call or email us on <ContactLinks bakery={bakery} /> with your order number (it starts with MC-). You cannot cancel from the website yet.</li>
        </ul>
      </Section>

      <Section title="If we cancel">
        <p>
          If we cannot deliver to your location, or cannot make your order in time, we cancel it and
          tell you. You pay nothing, and anything you paid is refunded in full.
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
            ? "A refund goes back to the card, UPI account or bank you paid with, through Razorpay. We issue it as soon as the cancellation is made, and it reaches you on Razorpay's refund timeline, usually 5 to 7 working days."
            : "We do not take payment on this website at the moment. We refund you the same way you paid, as soon as the cancellation is confirmed. A refund through Razorpay follows Razorpay's refund timeline, usually 5 to 7 working days."}
        </p>
      </Section>
    </PolicyPage>
  );
}
