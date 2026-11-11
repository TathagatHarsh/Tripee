import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShopFooter } from "@/components/shop/ShopFooter";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { getBakeryInfo } from "@/lib/catalogData";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { sBtn, sCard, sEyebrow } from "@/lib/shopUi";
import { formatDue } from "@/lib/whatsappMessages";
import { PayButton } from "./PayButton";

// The token is the only key to this page: keep it out of search results and referrers.
export const metadata: Metadata = { title: "Your custom cake quote · MakeYourCakes", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The customer's quote, reached from the Pay now button in WhatsApp. The bakery is never named. */
export default async function CustomQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await db.customRequest.findUnique({ where: { token }, include: { order: { select: { ref: true } } } });
  if (!r) notFound();
  const bakery = await getBakeryInfo();
  const live = r.status === "quoted" && r.quotePaise !== null && r.quoteExpiresAt !== null && r.quoteExpiresAt > new Date();

  const facts: [string, string][] = [
    ["Size", `${r.sizeKg.toString()} kg`],
    ["Flavour", r.flavour],
    ["Message on the cake", r.cakeMessage || "None"],
    ["Delivery", formatDue(r.dueAt)],
  ];

  return (
    <div className="s-root flex min-h-dvh flex-col bg-s-cream">
      <ShopHeader />
      <main id="main" className="mx-auto flex w-full max-w-[44rem] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
        <div className="flex flex-col gap-2">
          <span className={sEyebrow}>Custom cake · {r.ref}</span>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-s-cocoa">Your quote</h1>
        </div>
        <div className={`${sCard} grid gap-5 p-5 sm:grid-cols-[12rem_1fr]`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.photoUrl} alt="The cake photo you sent us" className="aspect-square w-full rounded-s object-cover" />
          <dl className="grid content-start gap-3 text-[0.9375rem]">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-s-bark">{label}</dt>
                <dd className="font-semibold break-words text-s-cocoa">{value}</dd>
              </div>
            ))}
            {r.quotePaise !== null && (
              <div>
                <dt className="text-s-bark">Price, delivered</dt>
                <dd className="font-display text-[1.75rem] text-s-cocoa">{formatINR(r.quotePaise)}</dd>
              </div>
            )}
          </dl>
        </div>
        {live ? (
          <div className="flex flex-col gap-3">
            <p className="text-s-bark">Valid until {formatDue(r.quoteExpiresAt)}</p>
            <PayButton token={token} name={r.name} phone={r.phone} amount={formatINR(r.quotePaise!)} />
          </div>
        ) : r.status === "paid" && r.order ? (
          <p className="text-s-cocoa">
            Paid — this is now order {r.order.ref}.{" "}
            <Link href={`/orders/${r.order.ref}`} className={sBtn("outline", "md")}>View your order</Link>
          </p>
        ) : (
          <p role="status" className="text-s-cocoa">This quote is no longer available</p>
        )}
      </main>
      <ShopFooter bakery={bakery} />
    </div>
  );
}
