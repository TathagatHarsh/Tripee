"use client";
import { CustomerAssignmentStatus } from "@/components/assignment/CustomerStatus";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/format";
import { sBtn } from "@/lib/shopUi";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Receipt } from "@/lib/orderReceipt";
import { CakeCelebration } from "./CakeCelebration";
export type { Receipt } from "@/lib/orderReceipt";

export function OrderPlaced({ receipt, celebrate = false }: { receipt: Receipt; celebrate?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const revealed = !celebrate || reduced || settled;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    region.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!celebrate || reduced) return;
    const timer = window.setTimeout(() => setSettled(true), 1900);
    return () => window.clearTimeout(timer);
  }, [celebrate, reduced]);
  useEffect(() => {
    if (revealed) heading.current?.focus({ preventScroll: true });
  }, [revealed]);
  return (
    <div ref={region} tabIndex={-1} role="region" aria-label="Order confirmed" className={`order-celebration mx-auto max-w-2xl text-center outline-none ${celebrate && !reduced ? "is-celebrating" : ""}`}>
      <p role="status" className="sr-only">Order confirmed.</p>
      <CakeCelebration />
      <div className="celebration-confirmation" hidden={!revealed}>
        <span className="text-xs font-semibold uppercase tracking-[.16em] text-s-berry">
          A lovely moment is in the making
        </span>
        <h2
          ref={heading}
          tabIndex={-1}
          className="mt-3 text-4xl outline-none sm:text-5xl"
        >
          Order Confirmed!
        </h2>
        <p className="mx-auto mt-4 max-w-md text-s-bark">
          {receipt.method === "pickup" ? "A lovely pickup is in the making." : "Your cake is officially in the making."}
          <span className="mt-2 block text-sm">We’ll call to confirm the details before baking. No payment has been taken.</span>
        </p>
        {receipt.method === "delivery" && <CustomerAssignmentStatus orderRef={receipt.ref}/>}
        <div className="celebration-details my-6 rounded-s border border-s-line bg-s-shell p-5 text-left sm:p-7">
          <div className="flex flex-wrap justify-between gap-3 border-b border-s-line pb-4">
            <span className="text-sm font-semibold">Order #{receipt.ref}</span>
            <strong>{formatINR(receipt.totalPaise)}</strong>
          </div>
          <dl className="grid gap-5 py-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-s-bark">
                Requested arrival
              </dt>
              <dd className="mt-2 text-sm">
                {receipt.date ? new Intl.DateTimeFormat("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(`${receipt.date}T12:00:00+05:30`)) : "See your order for arrival details"}
                <br />
                {receipt.window}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-s-bark">
                {receipt.method === "pickup" ? "Collection" : "Delivery to"}
              </dt>
              <dd className="mt-2 text-sm">{receipt.address}</dd>
            </div>
          </dl>
          <ul className="border-t border-s-line pt-4">
            {receipt.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-4 py-2 text-sm">
                <span>
                  {item.name}
                  <small className="block text-s-bark">{item.variant}</small>
                </span>
                <span>× {item.qty}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/orders/${receipt.ref}`} className={sBtn("primary", "lg")}>
            Track your order ↗
          </Link>
          <Link href="/shop" className={sBtn("outline", "lg")}>
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
