import type { Metadata } from "next";
import Link from "next/link";
import { ContactLinks, PolicyPage, Section } from "@/components/shop/PolicyPage";
import { LEGAL_NAME } from "@/lib/brand";
import { getBakeryInfo } from "@/lib/catalogData";
import { paymentsEnabled } from "@/lib/razorpay";

export const metadata: Metadata = {
  title: "Terms of service · MakeYourCakes",
  description: "The terms on which MakeYourCakes takes, makes and delivers cake orders.",
};

const UPDATED = "6 November 2026";

/**
 * The terms of service.
 *
 * Like app/privacy, every statement is about what this code does today: orders
 * are confirmed by a call (CheckoutForm says so), the price is frozen when the
 * order is placed (Order.priceBreakdown), cakes are made by MakeYourCakes or a
 * partner bakery (lib/assignment), and whether money is taken online follows
 * `paymentsEnabled()` rather than a sentence somebody has to remember to edit.
 */
export default async function TermsPage() {
  const bakery = await getBakeryInfo();
  const online = paymentsEnabled();

  return (
    <PolicyPage
      bakery={bakery}
      eyebrow="Terms"
      title="Terms of service"
      intro={<>These terms apply when you order a cake from MakeYourCakes through this website. Last updated {UPDATED}.</>}
    >
      <Section title="Who we are">
        <p>
          MakeYourCakes is a bakery brand run by {LEGAL_NAME}, a food business in Hyderabad, at{" "}
          {bakery.address}.
          {bakery.fssaiLicence && <> {LEGAL_NAME} is registered with FSSAI, registration number {bakery.fssaiLicence}.</>}{" "}
          In these terms, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean {LEGAL_NAME}. You can reach us on{" "}
          <ContactLinks bakery={bakery} />.
        </p>
      </Section>

      <Section title="Your order">
        <ul>
          <li>Placing an order on this website is a request for a cake. We call the number you give us to confirm the cake and the delivery details before we start baking.</li>
          <li>Every cake is made to order, by MakeYourCakes or by one of our partner bakeries in Hyderabad.</li>
          <li>Please check the cake, size, sponge, message and delivery details before you place the order. They are what we bake and deliver.</li>
          <li>We may decline or cancel an order we cannot make or deliver, for example if nobody can bake it in time or the address is outside our delivery area. If that happens, you are not charged, and anything you paid is refunded in full.</li>
        </ul>
      </Section>

      <Section title="Prices and payment">
        <p>
          Prices are in Indian rupees and include GST. Checkout shows the cake, the delivery charge
          and the total, and that is the price of your order: later changes to the menu do not
          change an order already placed.
        </p>
        <p>
          {online
            ? "Online payments are handled by Razorpay. We never see or store your card number."
            : "We do not take payment on this website at the moment. When we call to confirm your order, we explain how to pay."}
        </p>
      </Section>

      <Section title="The cake">
        <ul>
          <li>Cakes are made by hand, so the finished cake can differ a little from the photographs in colour, decoration and shape.</li>
          <li>Each cake lists the allergens it contains, such as egg, milk, wheat and nuts. Tell us about any allergy before you order. Our cakes are made in kitchens that handle all of these ingredients, so we cannot promise a cake is free of traces.</li>
          <li>Cakes are perishable. Keep it refrigerated and eat it within a day of delivery.</li>
        </ul>
      </Section>

      <Section title="Delivery, cancellation and refunds">
        <p>
          How delivery works is set out in the{" "}
          <Link href="/shipping-policy" className="underline decoration-s-line underline-offset-4 hover:decoration-s-bark">delivery policy</Link>.
          When you can cancel and how refunds work is in the{" "}
          <Link href="/refund-policy" className="underline decoration-s-line underline-offset-4 hover:decoration-s-bark">cancellation and refund policy</Link>.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You can order with or without an account. If you sign in, keep your sign-in details to
          yourself: orders placed from your account are treated as yours. If you order without an
          account, this device remembers the order so you can follow it.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          If something goes wrong with an order, our responsibility is limited to the amount you paid
          for that order. Nothing in these terms limits any right you have under Indian consumer law.
        </p>
      </Section>

      <Section title="Law and changes">
        <p>
          These terms are governed by the laws of India, and disputes are subject to the courts in
          Hyderabad, Telangana. If we change these terms, we update this page and the date at the top;
          an order you have already placed is governed by the terms that applied when you placed it.
        </p>
      </Section>
    </PolicyPage>
  );
}
