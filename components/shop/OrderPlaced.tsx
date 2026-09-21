"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatINR } from "@/lib/format";
import { sBtn } from "@/lib/shopUi";
export type Receipt = {
  ref: string;
  totalPaise: number;
  date: string;
  window: string;
  address: string;
  items: { name: string; variant: string; qty: number }[];
};
export function OrderPlaced({ receipt }: { receipt: Receipt }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="mx-auto max-w-2xl py-6 text-center">
      <div className="s-seal mx-auto mb-6 grid size-20 place-items-center rounded-full border border-s-done/25 bg-s-done-wash text-s-done">
        <svg viewBox="0 0 24 24" className="size-9" fill="none" aria-hidden>
          <path
            className="s-check"
            d="m5 12 4 4L19 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="text-xs font-semibold uppercase tracking-[.16em] text-s-berry">
        A lovely moment is in the making
      </span>
      <h2
        ref={heading}
        tabIndex={-1}
        className="mt-3 text-4xl outline-none sm:text-5xl"
      >
        Your order is with us.
      </h2>
      <p className="mx-auto mt-4 max-w-md text-s-bark">
        We’ll call to confirm the details before we start baking. No payment has
        been taken.
      </p>
      <div className="my-8 rounded-s border border-s-line bg-s-shell p-5 text-left sm:p-7">
        <div className="flex flex-wrap justify-between gap-3 border-b border-s-line pb-4">
          <span className="text-sm font-semibold">Order {receipt.ref}</span>
          <strong>{formatINR(receipt.totalPaise)}</strong>
        </div>
        <dl className="grid gap-5 py-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-s-bark">
              Requested arrival
            </dt>
            <dd className="mt-2 text-sm">
              {new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Kolkata",
              }).format(new Date(`${receipt.date}T12:00:00+05:30`))}
              <br />
              {receipt.window}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-s-bark">
              Where the celebration is
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
  );
}
