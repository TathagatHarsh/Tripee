import type { Metadata } from "next";
import { ContactLinks, PolicyPage, Section } from "@/components/shop/PolicyPage";
import { getBakeryInfo } from "@/lib/catalogData";

export const metadata: Metadata = {
  title: "Contact us · MakeYourCakes",
  description: "Call, email or visit MakeYourCakes in Hyderabad.",
};

/**
 * Contact. Every fact is `catalog.bakery`, the row the owner edits at
 * /admin/settings, for the footer's reason: a page that types a phone number
 * keeps printing last year's phone number. The FSSAI line follows the footer's
 * rule too: printed only once a licence number has been entered.
 */
export default async function ContactPage() {
  const bakery = await getBakeryInfo();

  return (
    <PolicyPage
      bakery={bakery}
      eyebrow="Contact"
      title="Contact us"
      intro={<>Questions about a cake, an order or a delivery? We would love to hear from you.</>}
    >
      <Section title="Call or email">
        <p>
          Reach us on <ContactLinks bakery={bakery} />. If it is about an order, have your order
          number ready (it starts with MC-) and we can help faster.
        </p>
      </Section>

      <Section title="Visit">
        <address className="flex flex-col gap-1 not-italic">
          <span>{bakery.name}</span>
          <span>{bakery.address}</span>
          <span>{bakery.hours}</span>
        </address>
      </Section>

      {bakery.fssaiLicence && (
        <Section title="Food licence">
          <p>FSSAI licence number {bakery.fssaiLicence}.</p>
        </Section>
      )}
    </PolicyPage>
  );
}
