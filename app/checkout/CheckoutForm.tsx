"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { LocationSheet } from "@/components/shop/LocationSheet";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { PriceRoll } from "@/components/shop/PriceRoll";
import { payWithRazorpay } from "@/components/shop/payWithRazorpay";
import { OrderReceipt } from "@/lib/orderReceipt";
import { OrderPlaced, type Receipt } from "@/components/shop/OrderPlaced";
import { useCart, useCartHydrated } from "@/lib/cart";
import { variantById, variantLabel, type CakeProductView } from "@/lib/cakes";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { checkoutIntent, keptAttempt, nameOk, PaymentProof, phoneOk } from "@/lib/checkout";
import { resolveSlot } from "@/lib/delivery";
import { formatINR } from "@/lib/format";
import { scheduleVerdict, slotWindow } from "@/lib/scheduling";
import { DeliverySlot } from "@/lib/schema";
import { sBtn, sCard, sField } from "@/lib/shopUi";

const DRAFT_KEY = "makemycake.checkoutDraft.v2";
const RECEIPT_KEY = "makemycake.checkoutReceipt.v2";
const DraftSchema = z.object({
  name: z.string().max(80),
  phone: z.string().max(30),
  email: z.string().max(254),
  method: z.enum(["delivery", "pickup"]),
  slot: DeliverySlot,
  locality: z.string().max(120).default(""),
  formattedAddress: z.string().max(1000).default(""),
  source: z.enum(["manual", "map", "current_location"]).default("manual"),
  addressLine1: z.string().max(160),
  addressLine2: z.string().max(160),
  landmark: z.string().max(120),
  city: z.string().max(80),
  state: z.string().max(80),
  pincode: z.string().max(6),
  requestedDate: z.string(),
  deliveryInstructions: z.string().max(500),
  customerNotes: z.string().max(1000),
  occasion: z.string().max(80),
  location: z
    .object({ lat: z.number(), lng: z.number(), placeId: z.string() })
    .nullable(),
  building: z.string().max(120).default(""),
  forSomeoneElse: z.boolean().default(false),
  recipientName: z.string().max(80).default(""),
  recipientPhone: z.string().max(10).default(""),
});
type Draft = z.infer<typeof DraftSchema>;
type Quote = {
  each: number[];
  productSubtotalPaise: number;
  deliveryFeePaise: number;
  gstPaise: number;
  totalPaise: number;
};
const QuoteSchema = z.object({
  each: z.array(z.number().int().nonnegative()),
  productSubtotalPaise: z.number().int().nonnegative(),
  deliveryFeePaise: z.number().int().nonnegative(),
  gstPaise: z.number().int().nonnegative(),
  totalPaise: z.number().int().nonnegative(),
});
function istDate(date = new Date()) {
  return new Date(date.getTime() + 19800000).toISOString().slice(0, 10);
}
function readDraft(): Draft {
  try {
    const parsed = DraftSchema.safeParse(
      JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null"),
    );
    if (parsed.success) return parsed.data;
  } catch {}
  return {
    name: "",
    phone: "",
    email: "",
    method: "delivery",
    slot: "standard",
    locality: "",
    formattedAddress: "",
    source: "manual",
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "",
    requestedDate: istDate(new Date(Date.now() + 7 * 86400000)),
    deliveryInstructions: "",
    customerNotes: "",
    occasion: "",
    location: null,
    building: "",
    forSomeoneElse: false,
    recipientName: "",
    recipientPhone: "",
  };
}
function readReceipt(): Receipt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? "null");
    const parsed = OrderReceipt.safeParse(value);
    if (parsed.success) return parsed.data;
  } catch {}
  return null;
}
type Props = {
  catalog: CatalogSnapshot;
  cakes: CakeProductView[];
  payments: { enabled: boolean; testMode: boolean };
};
const ATTEMPT_KEY = "makemycake.checkoutAttempt";
/** The in-flight checkout: its idempotency key, and the payment once Razorpay has taken it. */
type Attempt = { signature: string; key: string; proof?: PaymentProof };
/** Answers that mean the quote moved under the customer: ask for a fresh one. */
const REQUOTE = [
  "price_changed",
  "option_unavailable",
  "cake_unavailable",
  "capacity_unavailable",
];
const STOPPED = {
  dismissed: "Payment cancelled. Nothing was charged.",
  unavailable:
    "We couldn't open the payment window. Check your connection or turn off ad blockers, then try again.",
};
/** The server will never accept this proof, so keeping it would only strand the customer. */
const PROOF_REJECTED = ["payment_required", "payment_invalid"];
function readAttempt(): Attempt | null {
  try {
    const saved = JSON.parse(localStorage.getItem(ATTEMPT_KEY) ?? "null");
    if (typeof saved?.signature === "string" && z.uuid().safeParse(saved.key).success)
      return { signature: saved.signature, key: saved.key, proof: PaymentProof.safeParse(saved.proof).data };
  } catch {}
  return null;
}
export function CheckoutForm(props: Props) {
  const hydrated = useCartHydrated();
  return hydrated ? (
    <Checkout {...props} />
  ) : (
    <div
      className="grid gap-6 lg:grid-cols-[1fr_24rem]"
      role="status"
      aria-label="Loading checkout"
    >
      {[0, 1].map((i) => (
        <div key={i} className="h-96 animate-pulse rounded-s bg-s-cream-deep" />
      ))}
    </div>
  );
}
function Checkout({ catalog, cakes, payments }: Props) {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const [draft, setDraft] = useState(readDraft);
  const [receipt, setReceipt] = useState<Receipt | null>(readReceipt);
  const [celebrate, setCelebrate] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [stage, setStage] = useState<"paying" | "confirming" | null>(null);
  // The checkout this browser has already paid for, if any: the label reads it, place() reads the ref.
  const [paidSignature, setPaidSignature] = useState(() => {
    const saved = payments.enabled ? readAttempt() : null;
    return saved?.proof ? saved.signature : null;
  });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [answer, setAnswer] = useState<{
    signature: string;
    quote?: Quote;
    error?: string;
    code?: string;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editArea, setEditArea] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const submitting = useRef(false);
  const patch = (change: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...change, ...(change.location === null ? { source: "manual" as const, formattedAddress: "" } : {}) }));
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft]);

  const resolved = useMemo(
    () =>
      lines.map((line) => {
        const cake = cakes.find((c) => c.slug === line.slug);
        return {
          line,
          cake,
          variant: cake ? variantById(cake, line.variantId) : undefined,
        };
      }),
    [lines, cakes],
  );
  const missing = resolved.some((r) => !r.cake || !r.variant?.isAvailable);
  const delivery = draft.method === "pickup" ? "pickup" : draft.slot;
  const slot = resolveSlot(
    delivery,
    draft.method === "delivery" ? draft.pincode : undefined,
    catalog,
  );
  const pincodeOk = /^\d{6}$/.test(draft.pincode);
  const receiverOk =
    !draft.forSomeoneElse ||
    (nameOk(draft.recipientName) && /^\d{10}$/.test(draft.recipientPhone));
  /* Complete means pinned, a door number, a place and a receiver: no separate
     "confirm" step, the pin was the confirmation. */
  const addressComplete =
    Boolean(draft.location) &&
    draft.addressLine1.trim().length >= 1 &&
    draft.city.trim().length >= 2 &&
    draft.state.trim().length >= 2 &&
    pincodeOk &&
    receiverOk;
  const items = useMemo(
    () =>
      lines.map((line) => ({
        cakeSlug: line.slug,
        variantId: line.variantId,
        qty: line.qty,
        choices: {
          ...line.choices,
          delivery,
          pincode: draft.method === "delivery" ? draft.pincode : undefined,
        },
      })),
    [lines, delivery, draft.pincode, draft.method],
  );
  // Contact and address typing never trigger price requests. Only price-affecting choices do.
  const quoteSignature = JSON.stringify({
    items,
    fulfillment: {
      method: draft.method,
      slot: delivery,
      pincode: draft.method === "delivery" ? draft.pincode : undefined,
      requestedDate: draft.requestedDate,
    },
  });
  const canQuote =
    lines.length > 0 &&
    !missing &&
    Boolean(draft.requestedDate) &&
    (draft.method === "pickup" || /^\d{6}$/.test(draft.pincode));
  useEffect(() => {
    if (!canQuote) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/price", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: quoteSignature,
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          setAnswer({
            signature: quoteSignature,
            error: data.error ?? "We couldn't verify this delivery.",
            code: data.code,
          });
          return;
        }
        const quote = QuoteSchema.parse(data.quote);
        setAnswer({ signature: quoteSignature, quote });
      } catch (e) {
        if (!controller.signal.aborted)
          setAnswer({
            signature: quoteSignature,
            error:
              e instanceof z.ZodError
                ? "The price response couldn't be verified. Please try again."
                : "Unable to verify delivery and price. Check your connection and retry.",
          });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [quoteSignature, canQuote, retry]);
  const current = answer?.signature === quoteSignature ? answer : null;
  const quote = current?.quote;
  const emailOk = !draft.email || z.email().safeParse(draft.email).success;
  const contactOk = nameOk(draft.name) && phoneOk(draft.phone) && emailOk;
  const ready =
    contactOk &&
    (draft.method === "pickup" || addressComplete) &&
    Boolean(quote) &&
    !missing;

  function keyFor(signature: string) {
    // A saved payment is never overwritten: this press sends it on its own key,
    // and the server answers with its order or refunds it (the details differ).
    const kept = keptAttempt(signature, payments.enabled, attempt.current, readAttempt());
    if (kept) {
      attempt.current = kept;
      return kept.key;
    }
    attempt.current = { signature, key: crypto.randomUUID() };
    try {
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt.current));
    } catch {}
    return attempt.current.key;
  }
  /** Remember (or forget) the payment taken for this attempt, so a lost confirm never charges twice. */
  function keepProof(proof?: PaymentProof) {
    if (!attempt.current) return;
    attempt.current = { ...attempt.current, proof };
    setPaidSignature(proof ? attempt.current.signature : null);
    try {
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt.current));
    } catch {}
  }
  function fail(data: { error?: string; code?: string }, fallback: string) {
    setError(data.error ?? fallback);
    if (REQUOTE.includes(String(data.code))) {
      setAnswer(null);
      setRetry((n) => n + 1);
    }
  }
  function checkoutBody(quote: Quote) {
    const fulfillment = {
      method: draft.method,
      slot: delivery,
      recipientName:
        draft.method === "delivery" && draft.forSomeoneElse ? draft.recipientName : draft.name,
      contactEmail: draft.email || undefined,
      requestedDate: draft.requestedDate,
      requestedWindow: slotWindow(slot),
      customerNotes: draft.customerNotes || undefined,
      occasion: draft.occasion || undefined,
      ...(draft.method === "delivery"
        ? {
            locality: draft.locality,
            formattedAddress: draft.formattedAddress,
            source: draft.source,
            addressLine1: draft.addressLine1,
            addressLine2:
              [draft.building.trim(), draft.addressLine2].filter(Boolean).join(", ").slice(0, 160) || undefined,
            recipientPhone: draft.forSomeoneElse ? draft.recipientPhone : undefined,
            landmark: draft.landmark || undefined,
            city: draft.city,
            state: draft.state,
            pincode: draft.pincode,
            deliveryInstructions: draft.deliveryInstructions || undefined,
            location: draft.location ?? undefined,
          }
        : {}),
    };
    return {
      quotedOrderTotalPaise: quote.totalPaise,
      customerName: draft.name,
      customerPhone: draft.phone,
      fulfillment,
      items: items.map((item, i) => ({
        ...item,
        quotedTotalPaise: Math.round(quote.each[i] / item.qty),
      })),
    };
  }
  async function place() {
    setTouched(true);
    if (!ready || !quote || submitting.current) return;
    submitting.current = true;
    setPlacing(true);
    setError("");
    const body = checkoutBody(quote);
    try {
      const request = {
        ...body,
        idempotencyKey: keyFor(JSON.stringify(checkoutIntent(body))),
      };
      const send = (url: string, payment?: PaymentProof) =>
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payment ? { ...request, payment } : request),
        });
      // With payments on, an order needs a Razorpay payment first. One already
      // taken for this attempt (the confirm was lost) is reused, never repeated.
      let payment = payments.enabled ? attempt.current?.proof : undefined;
      let order: unknown;
      if (payments.enabled && !payment) {
        setStage("paying");
        const response = await send("/api/payments/intent");
        const intent = await response.json();
        if (!response.ok) {
          fail(intent, "We couldn't start the payment. Nothing has been charged.");
          return;
        }
        if (intent.order) {
          order = intent.order; // already placed: a replay, nothing to pay
        } else {
          const paid = await payWithRazorpay({
            keyId: intent.keyId,
            razorpayOrderId: intent.razorpayOrderId,
            amountPaise: intent.amountPaise,
            name: draft.name,
            phone: draft.phone,
            email: draft.email || undefined,
          });
          if (paid.kind !== "paid") {
            setError(paid.kind === "failed" ? paid.message : STOPPED[paid.kind]);
            return;
          }
          payment = paid.proof;
          keepProof(payment);
        }
      }
      if (order === undefined) {
        if (payments.enabled) setStage("confirming");
        const response = await send("/api/orders", payment);
        const data = await response.json();
        if (!response.ok) {
          fail(
            data,
            payment
              ? "We couldn't place the order. Your payment is safe. Press the button again to finish."
              : "We couldn't place the order. Nothing has been charged.",
          );
          // A refund answer, or a proof the server refuses, ends this payment: the next press pays afresh.
          if (typeof data.refunded === "boolean" || PROOF_REJECTED.includes(String(data.code)))
            keepProof(undefined);
          return;
        }
        order = data.order;
      }
      const saved: Receipt = OrderReceipt.parse(order);
      // A storage failure after the server commits must never be presented as an order failure.
      try {
        sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(saved));
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      setCelebrate(true);
      setReceipt(saved);
      try { clear(); localStorage.removeItem(ATTEMPT_KEY); } catch { /* A cart storage failure cannot undo a committed order. */ }
    } catch {
      setError(
        payments.enabled && attempt.current?.proof
          ? "We couldn't confirm your order. Your payment is safe. Press the button again to finish; you won't be charged twice."
          : "We couldn't confirm the result. Retry with the same details; your attempt is protected against duplicate orders.",
      );
    } finally {
      submitting.current = false;
      setPlacing(false);
      setStage(null);
    }
  }
  if (receipt && (celebrate || lines.length === 0)) return <OrderPlaced receipt={receipt} celebrate={celebrate} />;
  if (lines.length === 0)
    return (
      <div className={`${sCard} p-10 text-center`}>
        <h2 className="text-3xl">A celebration starts with a cake.</h2>
        <p className="my-5 text-s-bark">
          Your basket is empty. Find something lovely to put in it.
        </p>
        <Link href="/shop" className={sBtn("primary", "lg")}>
          Shop cakes
        </Link>
      </div>
    );
  const serviceText = !canQuote
    ? "Enter your pincode and choose a date to check delivery."
    : !current
      ? "Checking delivery and price…"
      : quote
        ? `${draft.method === "pickup" ? "Pickup available" : "We deliver here"}${slot.zoneName ? ` · ${slot.zoneName}` : ""}`
        : current.code === "delivery_unavailable" ||
            (!slot.available && /^\d{6}$/.test(draft.pincode))
          ? "Not serviceable · please choose another address or pickup."
          : (current.error ?? "Unable to verify. Please retry.");

  // Paid for exactly this checkout already (the confirm was lost): the button finishes it.
  const finishing =
    paidSignature !== null &&
    quote !== undefined &&
    paidSignature === JSON.stringify(checkoutIntent(checkoutBody(quote)));
  const buttonLabel = !payments.enabled
    ? placing
      ? "Placing your order…"
      : quote
        ? `Place order · ${formatINR(quote.totalPaise)}`
        : "Place order"
    : stage === "confirming"
      ? "Confirming payment…"
      : placing
        ? "Opening payment…"
        : finishing
          ? "Finish placing order"
          : quote
            ? `Pay ${formatINR(quote.totalPaise)}`
            : "Pay";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <form
        className="checkout-form flex min-w-0 flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void place();
        }}
        noValidate
      >
        {/* Paid already: only "Finish placing order" is offered, so the paid details can't drift. */}
        <fieldset disabled={placing || finishing} className="contents">
          <section className={`checkout-section ${sCard} p-5 sm:p-7`}>
            <div className="mb-6">
              <h2 className="text-2xl">The person behind the celebration</h2>
              <p className="mt-2 text-sm text-s-bark">
                We’ll call to confirm your cake and delivery details.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Name"
                error={
                  touched && !nameOk(draft.name)
                    ? "Enter your full name."
                    : undefined
                }
              >
                <input
                  name="name"
                  autoComplete="name"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  maxLength={80}
                  required
                  className={sField()}
                  aria-invalid={touched && !nameOk(draft.name)}
                />
              </Field>
              <Field
                label="Phone"
                error={
                  touched && !phoneOk(draft.phone)
                    ? "Enter a valid Indian mobile number."
                    : undefined
                }
              >
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={draft.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                  maxLength={30}
                  required
                  className={sField()}
                  aria-invalid={touched && !phoneOk(draft.phone)}
                  placeholder="10-digit mobile number"
                />
              </Field>
              <Field
                label="Email (optional)"
                error={!emailOk ? "Enter a valid email address." : undefined}
              >
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={draft.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  maxLength={254}
                  className={sField()}
                  aria-invalid={!emailOk}
                />
              </Field>
            </div>
          </section>
          <section className={`checkout-section ${sCard} p-5 sm:p-7`}>
            <div className="mb-6">
              <h2 className="text-2xl">Delivery address</h2>
              <p className="mt-2 text-sm text-s-bark">
                To your doorstep, or ready for you at the bakery.
              </p>
            </div>
            <fieldset className="mb-5 grid grid-cols-2 gap-3">
              <legend className="sr-only">Fulfillment method</legend>
              {(["delivery", "pickup"] as const).map((method) => (
                <label
                  key={method}
                  className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-s-sm border p-4 ${draft.method === method ? "border-s-cocoa bg-s-cream-deep" : "border-s-line"}`}
                >
                  <input
                    type="radio"
                    name="method"
                    checked={draft.method === method}
                    onChange={() =>
                      patch({
                        method,
                        slot: method === "pickup" ? "pickup" : "standard",
                      })
                    }
                  />
                  <span className="font-semibold capitalize">{method}</span>
                </label>
              ))}
            </fieldset>
            {draft.method === "delivery" ? (
              <div className="flex flex-col gap-5">
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  disabled={placing}
                  className="flex min-h-16 w-full items-center justify-between gap-4 rounded-s border border-s-line bg-s-shell p-4 text-left transition-colors hover:border-s-cocoa"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-s-bark">Deliver to</span>
                    <span className="mt-0.5 block truncate font-semibold">
                      {draft.location
                        ? [draft.addressLine1, draft.building, draft.addressLine2, draft.locality, draft.pincode]
                            .map((part) => part.trim())
                            .filter(Boolean)
                            .join(", ") || "Pinned location"
                        : "Add delivery address"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-s-berry">
                    {draft.location ? "Change" : "Add"}
                  </span>
                </button>
                {draft.location && (
                  <>
                    <Field
                      label="Flat / house no. and floor"
                      error={touched && !draft.addressLine1.trim() ? "Add your flat or house number." : undefined}
                    >
                      <input
                        value={draft.addressLine1}
                        onChange={(e) => patch({ addressLine1: e.target.value })}
                        autoComplete="address-line1"
                        placeholder="Flat 402, 4th floor"
                        maxLength={160}
                        required
                        className={sField()}
                      />
                    </Field>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Building / society (optional)">
                        <input
                          value={draft.building}
                          onChange={(e) => patch({ building: e.target.value })}
                          maxLength={120}
                          className={sField()}
                        />
                      </Field>
                      <Field label="Landmark (optional)">
                        <input
                          value={draft.landmark}
                          onChange={(e) => patch({ landmark: e.target.value })}
                          maxLength={120}
                          className={sField()}
                        />
                      </Field>
                    </div>
                    {editArea || !pincodeOk ? (
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Area / locality">
                          <input value={draft.locality} onChange={(e) => patch({ locality: e.target.value })} maxLength={120} className={sField()} autoComplete="address-level3" />
                        </Field>
                        <Field label="City">
                          <input value={draft.city} onChange={(e) => patch({ city: e.target.value })} autoComplete="address-level2" maxLength={80} required className={sField()} />
                        </Field>
                        <Field label="State">
                          <input value={draft.state} onChange={(e) => patch({ state: e.target.value })} autoComplete="address-level1" maxLength={80} required className={sField()} />
                        </Field>
                        <Field label="Pincode" error={!pincodeOk && (touched || draft.pincode) ? "Enter the six-digit pincode for this address." : undefined}>
                          <input
                            value={draft.pincode}
                            onChange={(e) => patch({ pincode: e.target.value.replace(/\D/g, "") })}
                            autoComplete="postal-code"
                            inputMode="numeric"
                            maxLength={6}
                            required
                            className={sField()}
                          />
                        </Field>
                      </div>
                    ) : (
                      <p className="text-sm text-s-bark">
                        {[draft.locality, draft.city, draft.pincode].filter(Boolean).join(", ")}{" "}
                        <button type="button" onClick={() => setEditArea(true)} className="font-semibold text-s-berry underline underline-offset-2">
                          Edit
                        </button>
                      </p>
                    )}
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={draft.forSomeoneElse}
                        onChange={(e) => patch({ forSomeoneElse: e.target.checked })}
                        className="size-4"
                      />
                      <span className="font-semibold">Ordering for someone else?</span>
                    </label>
                    {draft.forSomeoneElse && (
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Receiver's name" error={touched && !nameOk(draft.recipientName) ? "Add the receiver's name." : undefined}>
                          <input value={draft.recipientName} onChange={(e) => patch({ recipientName: e.target.value })} maxLength={80} autoComplete="off" className={sField()} />
                        </Field>
                        <Field label="Receiver's phone" error={touched && !/^\d{10}$/.test(draft.recipientPhone) ? "Enter a 10-digit mobile number." : undefined}>
                          <input
                            value={draft.recipientPhone}
                            onChange={(e) => patch({ recipientPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                            inputMode="numeric"
                            autoComplete="off"
                            className={sField()}
                          />
                        </Field>
                      </div>
                    )}
                  </>
                )}
                {touched && !addressComplete && (
                  <p role="alert" className="text-sm text-s-stop">
                    {draft.location ? "Finish the address details above." : "Add your delivery address to continue."}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-s bg-s-cream-deep p-5">
                <p className="font-semibold">Collect from the bakery that makes your cake</p>
                <p className="mt-1 text-sm text-s-bark">
                  We&rsquo;ll share its address once a bakery accepts your order.
                </p>
              </div>
            )}
          </section>
          <section className={`checkout-section ${sCard} p-5 sm:p-7`}>
            <div className="mb-6">
              <h2 id="delivery-window-heading" tabIndex={-1} className="text-2xl">Make time for cake</h2>
              <p className="mt-2 text-sm text-s-bark">
                Choose your requested date and delivery window.
              </p>
            </div>
            <Field label="Requested date">
              <input
                type="date"
                value={draft.requestedDate}
                min={istDate()}
                onChange={(e) => patch({ requestedDate: e.target.value })}
                required
                className={sField()}
              />
            </Field>
            <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-semibold">
                Delivery window
              </legend>
              {Object.values(catalog.slots)
                .filter((s) =>
                  draft.method === "pickup"
                    ? s.slot === "pickup"
                    : s.slot !== "pickup",
                )
                .map((s) => {
                  const schedule = scheduleVerdict(draft.requestedDate, s);
                  const allowed =
                    schedule.ok &&
                    (draft.method === "pickup" ||
                      !/^\d{6}$/.test(draft.pincode) ||
                      resolveSlot(s.slot, draft.pincode, catalog).available);
                  return (
                    <label
                      key={s.slot}
                      className={`flex min-h-24 items-start gap-3 rounded-s-sm border p-4 ${delivery === s.slot ? "border-s-cocoa bg-s-cream-deep" : "border-s-line"} ${allowed ? "cursor-pointer" : "opacity-65"}`}
                    >
                      <input
                        type="radio"
                        name="slot"
                        checked={delivery === s.slot}
                        disabled={!allowed}
                        onChange={() => patch({ slot: s.slot })}
                        className="mt-1"
                      />
                      <span>
                        <strong className="block text-sm">{s.name}</strong>
                        <span className="mt-1 block text-xs text-s-bark">
                          {slotWindow(s)}
                        </span>
                        {!allowed && (
                          <span className="mt-1 block text-xs text-s-stop">
                            {schedule.message ?? "Unavailable for this pincode"}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
            </fieldset>
            <div
              className={`mt-5 rounded-s border p-4 text-sm ${quote ? "border-s-done/30 bg-s-done-wash text-s-done" : current?.error ? "border-s-stop/30 bg-s-stop-wash text-s-stop" : "border-s-line bg-s-cream"}`}
              role="status"
              aria-live="polite"
            >
              <strong>
                {quote ? "✓ " : ""}
                {serviceText}
              </strong>
              {current?.error && (
                <button
                  type="button"
                  className="ml-3 min-h-11 underline underline-offset-4"
                  onClick={() => {
                    setAnswer(null);
                    setRetry((n) => n + 1);
                  }}
                >
                  Check again
                </button>
              )}
            </div>
            <div className="mt-5 grid gap-5">
              <Field label="Delivery instructions (optional)">
                <textarea
                  rows={2}
                  value={draft.deliveryInstructions}
                  onChange={(e) =>
                    patch({ deliveryInstructions: e.target.value })
                  }
                  maxLength={500}
                  className={sField()}
                  placeholder="Gate code, where to leave the cake, or how to find you"
                />
              </Field>
              <Field label="Occasion (optional)">
                <input
                  value={draft.occasion}
                  onChange={(e) => patch({ occasion: e.target.value })}
                  maxLength={80}
                  className={sField()}
                  placeholder="Birthday, anniversary, just because…"
                />
              </Field>
              <Field label="Order notes (optional)">
                <textarea
                  value={draft.customerNotes}
                  onChange={(e) => patch({ customerNotes: e.target.value })}
                  maxLength={1000}
                  rows={2}
                  className={sField()}
                />
              </Field>
            </div>
          </section>
          <section className={`checkout-section ${sCard} p-5 sm:p-7`}>
            <div>
              <h2 className="text-2xl">All set for something sweet</h2>
              <p className="mt-3 text-sm text-s-bark">
                {payments.enabled
                  ? "We’ll call to confirm your order and delivery details before we start baking."
                  : "No online payment is taken. We’ll call to confirm your order and explain payment before we start baking."}
              </p>
            </div>
            <p className="mt-4 text-xs text-s-bark">
              Please review your cake specifications and requested delivery
              details before placing the order.
            </p>
          </section>
          {payments.enabled && (
            <section className={`checkout-section ${sCard} p-5 sm:p-7`}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl">Payment</h2>
                {payments.testMode && (
                  <span className="rounded-full border border-s-line-strong px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-s-bark">
                    Test mode
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-s-bark">
                Pay securely with Razorpay · UPI, cards, netbanking
              </p>
              {payments.testMode && (
                <p className="mt-2 text-xs text-s-bark">
                  Card 4386 2894 0766 0153, any future expiry, any CVV, any OTP
                </p>
              )}
            </section>
          )}
        </fieldset>
        {missing && (
          <p
            role="alert"
            className="rounded-s border border-s-stop/30 p-4 text-sm text-s-stop"
          >
            A cake or variant is no longer available.{" "}
            <Link href="/cart" className="underline">
              Review your basket.
            </Link>
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-s border border-s-stop/30 p-4 text-sm text-s-stop"
          >
            {error}
          </p>
        )}
        {touched && !ready && !error && (
          <p role="alert" className="text-sm text-s-stop">
            {!contactOk
              ? "Check your contact details."
              : draft.method === "delivery" && !addressComplete
                ? "Add your delivery address above."
                : "Delivery and pricing must be verified before placing your order."}
          </p>
        )}
        <button
          type="submit"
          disabled={placing}
          aria-disabled={!ready}
          aria-busy={placing}
          className={sBtn("primary", "lg", "w-full")}
        >
          {buttonLabel}
        </button>
      </form>
      {/* Outside the form on purpose: inside it, pressing Enter (or the phone
          keyboard's Search) in the sheet's search box submitted the order. */}
      <LocationSheet
        open={sheetOpen}
        initial={draft.location}
        catalog={catalog}
        onClose={() => setSheetOpen(false)}
        onPickup={() => {
          patch({ method: "pickup", slot: "pickup" });
          setSheetOpen(false);
        }}
        onConfirm={(address) => {
          patch({
            addressLine2: address.address.slice(0, 160),
            locality: address.locality ?? "",
            formattedAddress: address.address,
            source: address.source ?? "map",
            city: address.city || draft.city,
            state: address.state || draft.state,
            pincode: address.pincode,
            location: { lat: address.lat, lng: address.lng, placeId: address.placeId },
          });
          setEditArea(!address.pincode);
          setSheetOpen(false);
        }}
      />
      <aside
        aria-label="Order summary"
        className={`checkout-summary ${sCard} p-5 sm:p-7 lg:sticky lg:top-24`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl">Your celebration</h2>
          <Link
            href="/cart"
            className="min-h-11 content-center text-xs underline underline-offset-4"
          >
            Edit basket
          </Link>
        </div>
        <ul className="flex flex-col gap-5">
          {resolved.map(({ line, cake, variant }, i) => (
            <li
              key={line.id}
              className="flex gap-3 border-b border-s-line pb-5"
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-s-sm">
                {cake && (
                  <CakePhoto
                    src={cake.imageUrl}
                    alt={cake.name}
                    config={cake.config}
                    sizes="64px"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {cake?.name ?? line.slug}
                </p>
                <p className="mt-1 text-xs text-s-bark">
                  {variant ? variantLabel(variant) : "No longer available"} ·
                  Qty {line.qty}
                </p>
                {line.choices.message && (
                  <p className="mt-1 text-xs text-s-bark">
                    “{line.choices.message}”
                  </p>
                )}
                <p className="mt-2 text-sm font-semibold tabular-nums">
                  {quote ? formatINR(quote.each[i]) : "Awaiting price check"}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <dl className="mt-6 flex flex-col gap-3 text-sm">
          {[
            ["Cakes", quote?.productSubtotalPaise],
            [
              draft.method === "pickup" ? "Pickup" : "Delivery",
              quote?.deliveryFeePaise,
            ],
            [
              `GST (${Math.round(catalog.settings.gstRate * 100)}%)`,
              quote?.gstPaise,
            ],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-4">
              <dt className="text-s-bark">{label}</dt>
              <dd className="tabular-nums">
                {typeof value === "number"
                  ? value === 0
                    ? "Included"
                    : formatINR(value)
                  : "—"}
              </dd>
            </div>
          ))}
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-s-line pt-5">
            <dt className="font-semibold">{payments.enabled ? "To pay" : "Total"}</dt>
            <dd className="text-3xl font-semibold tracking-tight">
              <PriceRoll text={quote ? formatINR(quote.totalPaise) : "—"} />
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-s-bark">
          {quote
            ? payments.enabled
              ? "Verified with the bakery. You'll be charged once, when you pay."
              : "Verified with the bakery. Nothing charged today."
            : "The final price appears after delivery is verified."}
        </p>
        <div className="mt-6 border-t border-s-line pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider">
            Made for your moment
          </p>
          <p className="mt-2 text-sm text-s-bark">
            Baked to order, with the details that make it yours.
          </p>
        </div>
      </aside>
    </div>
  );
}
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-semibold">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-xs text-s-stop">
          {error}
        </span>
      )}
    </label>
  );
}
