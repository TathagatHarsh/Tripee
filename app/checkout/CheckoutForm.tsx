"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { LocationPicker } from "@/components/shop/LocationPicker";
import { CakePhoto } from "@/components/shop/CakePhoto";
import { PriceRoll } from "@/components/shop/PriceRoll";
import { OrderPlaced, type Receipt } from "@/components/shop/OrderPlaced";
import { useCart, useCartHydrated } from "@/lib/cart";
import { variantById, variantLabel, type CakeProductView } from "@/lib/cakes";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { checkoutIntent, nameOk, phoneOk } from "@/lib/checkout";
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
  };
}
function readReceipt(): Receipt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? "null");
    if (
      value &&
      typeof value.ref === "string" &&
      typeof value.totalPaise === "number" &&
      Array.isArray(value.items)
    )
      return value;
  } catch {}
  return null;
}
type Props = { catalog: CatalogSnapshot; cakes: CakeProductView[] };
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
function Checkout({ catalog, cakes }: Props) {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const [draft, setDraft] = useState(readDraft);
  const [receipt, setReceipt] = useState<Receipt | null>(readReceipt);
  const [placing, setPlacing] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [answer, setAnswer] = useState<{
    signature: string;
    quote?: Quote;
    error?: string;
    code?: string;
  } | null>(null);
  const [confirmedAddress, setConfirmedAddress] = useState("");
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const submitting = useRef(false);
  const patch = (change: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...change }));
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
  const addressSignature = JSON.stringify([
    draft.addressLine1,
    draft.addressLine2,
    draft.landmark,
    draft.city,
    draft.state,
    draft.pincode,
    draft.location,
  ]);
  const addressComplete =
    draft.addressLine1.trim().length >= 3 &&
    draft.city.trim().length >= 2 &&
    draft.state.trim().length >= 2 &&
    /^\d{6}$/.test(draft.pincode);
  const addressConfirmed =
    draft.method === "pickup" || confirmedAddress === addressSignature;
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
    addressConfirmed &&
    (draft.method === "pickup" || addressComplete) &&
    Boolean(quote) &&
    !missing;

  function keyFor(signature: string) {
    if (attempt.current?.signature === signature) return attempt.current.key;
    try {
      const saved = JSON.parse(
        localStorage.getItem("makemycake.checkoutAttempt") ?? "null",
      );
      if (
        saved?.signature === signature &&
        z.uuid().safeParse(saved.key).success
      ) {
        attempt.current = saved;
        return saved.key as string;
      }
    } catch {}
    attempt.current = { signature, key: crypto.randomUUID() };
    try {
      localStorage.setItem(
        "makemycake.checkoutAttempt",
        JSON.stringify(attempt.current),
      );
    } catch {}
    return attempt.current.key;
  }
  async function place() {
    setTouched(true);
    if (!ready || !quote || submitting.current) return;
    submitting.current = true;
    setPlacing(true);
    setError("");
    const fulfillment = {
      method: draft.method,
      slot: delivery,
      recipientName: draft.name,
      contactEmail: draft.email || undefined,
      requestedDate: draft.requestedDate,
      requestedWindow: slotWindow(slot),
      customerNotes: draft.customerNotes || undefined,
      occasion: draft.occasion || undefined,
      ...(draft.method === "delivery"
        ? {
            addressLine1: draft.addressLine1,
            addressLine2: draft.addressLine2 || undefined,
            landmark: draft.landmark || undefined,
            city: draft.city,
            state: draft.state,
            pincode: draft.pincode,
            deliveryInstructions: draft.deliveryInstructions || undefined,
            location: draft.location ?? undefined,
          }
        : {}),
    };
    const body = {
      quotedOrderTotalPaise: quote.totalPaise,
      customerName: draft.name,
      customerPhone: draft.phone,
      fulfillment,
      items: items.map((item, i) => ({
        ...item,
        quotedTotalPaise: Math.round(quote.each[i] / item.qty),
      })),
    };
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          idempotencyKey: keyFor(JSON.stringify(checkoutIntent(body))),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          data.error ??
            "We couldn't place the order. Nothing has been charged.",
        );
        if (
          [
            "price_changed",
            "option_unavailable",
            "cake_unavailable",
            "capacity_unavailable",
          ].includes(data.code)
        ) {
          setAnswer(null);
          setRetry((n) => n + 1);
        }
        return;
      }
      if (
        typeof data.order?.ref !== "string" ||
        typeof data.order?.totalPaise !== "number"
      )
        throw new Error("Invalid receipt");
      const saved: Receipt = {
        ref: data.order.ref,
        totalPaise: data.order.totalPaise,
        date: draft.requestedDate,
        window: slotWindow(slot),
        address:
          draft.method === "pickup"
            ? `Pickup · ${catalog.bakery.name}`
            : [
                draft.addressLine1,
                draft.addressLine2,
                draft.city,
                draft.state,
                draft.pincode,
              ]
                .filter(Boolean)
                .join(", "),
        items: resolved.map((r) => ({
          name: r.cake!.name,
          variant: variantLabel(r.variant!),
          qty: r.line.qty,
        })),
      };
      // A storage failure after the server commits must never be presented as an order failure.
      try {
        sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(saved));
        sessionStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem("makemycake.checkoutAttempt");
      } catch {}
      setReceipt(saved);
      clear();
    } catch {
      setError(
        "We couldn't confirm the result. Retry with the same details; your attempt is protected against duplicate orders.",
      );
    } finally {
      submitting.current = false;
      setPlacing(false);
    }
  }
  if (lines.length === 0 && receipt) return <OrderPlaced receipt={receipt} />;
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
        <fieldset disabled={placing} className="contents">
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
              <h2 className="text-2xl">A lovely arrival</h2>
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
                <LocationPicker
                  disabled={placing}
                  onConfirm={(address) => {
                    patch({
                      addressLine1: address.address.slice(0, 160),
                      city: address.city,
                      state: address.state,
                      pincode: address.pincode,
                      location: {
                        lat: address.lat,
                        lng: address.lng,
                        placeId: address.placeId,
                      },
                    });
                    setConfirmedAddress("");
                  }}
                />
                <Field label="Address line 1">
                  <input
                    value={draft.addressLine1}
                    onChange={(e) =>
                      patch({ addressLine1: e.target.value, location: null })
                    }
                    autoComplete="address-line1"
                    placeholder="Flat number, building and street"
                    maxLength={160}
                    required
                    className={sField()}
                  />
                </Field>
                <Field label="Address line 2 (optional)">
                  <input
                    value={draft.addressLine2}
                    onChange={(e) => patch({ addressLine2: e.target.value })}
                    autoComplete="address-line2"
                    maxLength={160}
                    className={sField()}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="City">
                    <input
                      value={draft.city}
                      onChange={(e) =>
                        patch({ city: e.target.value, location: null })
                      }
                      autoComplete="address-level2"
                      maxLength={80}
                      required
                      className={sField()}
                    />
                  </Field>
                  <Field label="State">
                    <input
                      value={draft.state}
                      onChange={(e) =>
                        patch({ state: e.target.value, location: null })
                      }
                      autoComplete="address-level1"
                      maxLength={80}
                      required
                      className={sField()}
                    />
                  </Field>
                  <Field label="Pincode">
                    <input
                      value={draft.pincode}
                      onChange={(e) =>
                        patch({
                          pincode: e.target.value.replace(/\D/g, ""),
                          location: null,
                        })
                      }
                      autoComplete="postal-code"
                      inputMode="numeric"
                      maxLength={6}
                      required
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
                {addressComplete && (
                  <div className="location-result rounded-s border border-s-line bg-s-cream p-4">
                    <p className="text-sm font-semibold">
                      Your delivery address
                    </p>
                    <p className="my-2 text-sm text-s-bark">
                      {[
                        draft.addressLine1,
                        draft.addressLine2,
                        draft.landmark,
                        draft.city,
                        draft.state,
                        draft.pincode,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <button
                      type="button"
                      className={sBtn(
                        addressConfirmed ? "ghost" : "outline",
                        "sm",
                      )}
                      disabled={addressConfirmed}
                      onClick={() => setConfirmedAddress(addressSignature)}
                    >
                      {addressConfirmed
                        ? "✓ Address confirmed"
                        : "Confirm this address"}
                    </button>
                  </div>
                )}
                {touched && !addressConfirmed && (
                  <p role="alert" className="text-sm text-s-stop">
                    Complete the address and confirm it above.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-s bg-s-cream-deep p-5">
                <p className="font-semibold">{catalog.bakery.name}</p>
                <p className="mt-1 text-sm text-s-bark">
                  {catalog.bakery.address}
                </p>
              </div>
            )}
          </section>
          <section className={`checkout-section ${sCard} p-5 sm:p-7`}>
            <div className="mb-6">
              <h2 className="text-2xl">Make time for cake</h2>
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
                No online payment is taken. We’ll call to confirm your order and
                explain payment before we start baking.
              </p>
            </div>
            <p className="mt-4 text-xs text-s-bark">
              Please review your cake specifications and requested delivery
              details before placing the order.
            </p>
          </section>
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
              : !addressConfirmed
                ? "Confirm your delivery address above."
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
          {placing
            ? "Placing your order…"
            : quote
              ? `Place order · ${formatINR(quote.totalPaise)}`
              : "Place order"}
        </button>
      </form>
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
            <dt className="font-semibold">Total</dt>
            <dd className="text-3xl font-semibold tracking-tight">
              <PriceRoll text={quote ? formatINR(quote.totalPaise) : "—"} />
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-s-bark">
          {quote
            ? "Verified with the bakery. Nothing charged today."
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
