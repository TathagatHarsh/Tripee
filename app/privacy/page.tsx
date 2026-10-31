import type { Metadata } from "next";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { getBakeryInfo } from "@/lib/catalogData";
import { sEyebrow } from "@/lib/shopUi";

export const metadata: Metadata = {
  title: "Privacy policy · MakeYourCakes",
  description:
    "What MakeYourCakes collects when you order a cake, who it is shared with, and how to ask for it to be corrected or deleted.",
};

const UPDATED = "31 October 2026";

/**
 * The privacy policy.
 *
 * Meta will not switch a WhatsApp Business app to Live without a public privacy
 * policy URL, and a shop that takes names, phone numbers and delivery addresses
 * ought to have one regardless. Every statement here is a statement about what
 * this code does today, checked against it: the fields on `Order`, the
 * services in package.json, the cookies in lib/guestOrders, and the WhatsApp
 * message builders in lib/whatsappMessages (which carry the order reference,
 * cake, due time and delivery area, and never a customer's phone or street).
 *
 * It deliberately states no retention period, because the app has no rule that
 * deletes anything on a schedule, and a number printed here would be a promise
 * nothing keeps. Change the wording when the behaviour changes.
 */
export default async function PrivacyPage() {
  const bakery = await getBakeryInfo();

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />

      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[84rem] px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
          <article className="flex max-w-[46rem] flex-col gap-10">
            <header className="flex flex-col items-start gap-4">
              <span className={sEyebrow}>Privacy</span>
              <h1 className="text-[2.5rem] leading-[1.05] sm:text-[3.25rem]">Privacy policy</h1>
              <p className="max-w-[60ch] text-[1.125rem] leading-relaxed text-s-bark">
                MakeYourCakes is a bakery in Jubilee Hills, Hyderabad. This page
                explains what this website and our ordering system collect, why,
                and who else sees it. Last updated {UPDATED}.
              </p>
            </header>

            <Section title="What we collect">
              <p>When you place an order we collect:</p>
              <ul>
                <li>your name, phone number and email address;</li>
                <li>the recipient&rsquo;s name;</li>
                <li>
                  the delivery address (address lines, landmark, city, pincode) and the map
                  pin you confirm;
                </li>
                <li>the cake you chose, the message you want on it, and any notes you add.</li>
              </ul>
              <p>
                If you sign in, your sign-in details are handled by our sign-in
                provider, Clerk, and your orders are linked to your account. If you pay
                online, Razorpay takes the payment. We keep the order and payment
                reference numbers and whether the payment went through. We never see or
                store your card number.
              </p>
            </Section>

            <Section title="Cookies">
              <p>
                We use a sign-in session cookie, and, if you order without an account, a
                signed cookie that lets you see the order you placed. We do not use
                advertising or analytics cookies.
              </p>
            </Section>

            <Section title="How we use it">
              <p>
                To bake and deliver your order, to contact you about it, to take payment
                and handle cancellations and refunds, and to keep our order records.
              </p>
            </Section>

            <Section title="Who else sees it">
              <ul>
                <li>
                  <strong>Partner bakeries.</strong> The bakery that bakes your cake sees
                  what it needs to make it: the cake details, the message on it, the due
                  time and the delivery area.
                </li>
                <li>
                  <strong>WhatsApp.</strong> We use WhatsApp, which is run by Meta, to
                  coordinate with partner bakeries and our own team. Those messages carry
                  the order number, cake details, due time, delivery area and a photo of
                  the cake. They do not carry your phone number or your full address.
                </li>
                <li>
                  <strong>Service providers.</strong> Clerk (sign-in), Razorpay
                  (payments), Ola Maps (the address or pin you type or pick is sent to it
                  to find the place and work out the delivery distance), and our hosting
                  and database providers, who store the data for us.
                </li>
              </ul>
              <p>We do not sell your personal information.</p>
            </Section>

            <Section title="How long we keep it">
              <p>
                We keep order records for as long as we need them to run the bakery,
                sort out any problem with your order, and meet our legal and accounting
                duties.
              </p>
            </Section>

            <Section title="Your choices">
              <p>
                You can ask us what we hold about you, ask us to correct it, or ask us
                to delete it by writing to{" "}
                <a
                  href={`mailto:${bakery.email}`}
                  className="break-all underline decoration-s-line underline-offset-4 hover:decoration-s-bark"
                >
                  {bakery.email}
                </a>
                . We may need to keep some records, such as the details of a paid order,
                to meet legal and accounting duties.
              </p>
            </Section>

            <Section title="Changes">
              <p>
                If we change how we handle your information, we will update this page and
                the date at the top.
              </p>
            </Section>

            <Section title="Contact">
              <address className="flex flex-col gap-1 not-italic">
                <span>MakeYourCakes</span>
                <span>{bakery.address}</span>
                <a
                  href={`tel:${bakery.phone.replace(/\s/g, "")}`}
                  className="w-fit underline decoration-s-line underline-offset-4 hover:decoration-s-bark"
                >
                  {bakery.phone}
                </a>
              </address>
            </Section>
          </article>
        </div>
      </main>

      <ShopFooter bakery={bakery} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 text-[1.0625rem] leading-relaxed text-s-bark [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
      <h2 className="text-[1.5rem] text-s-cocoa sm:text-[1.75rem]">{title}</h2>
      {children}
    </section>
  );
}
