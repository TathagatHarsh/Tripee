"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BakingMark, BakingPanel } from "@/components/shop/BakingMark";
import { OrderPlaced } from "@/components/shop/OrderPlaced";
import { useCart, useCartHydrated } from "@/lib/cart";
import { variantById, variantLabel, type CakeChoices, type CakeProductView } from "@/lib/cakes";
import { DELIVERY_OPTIONS } from "@/lib/catalog";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { nameOk, phoneOk } from "@/lib/checkout";
import { resolveSlot } from "@/lib/delivery";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import type { DeliverySlot } from "@/lib/schema";
import { sBtn, sCard, sField } from "@/lib/shopUi";

/**
 * Checkout.
 *
 * ## One request, not one per cake
 *
 * This page used to place a basket by looping: one `POST /api/orders` per cake,
 * awaited in sequence, with a `stop()` helper for the case where the fourth
 * failed after three were written. That case was not hypothetical — it is what
 * a dropped connection halfway through a basket looks like — and it left the
 * customer with a partly-placed order and a cart that had already been emptied
 * around the cakes that never got placed.
 *
 * The whole basket now goes in one request and is written in one transaction,
 * so there is no partial state to report and no partial cart to repair. What
 * has *not* changed is the shape underneath: `Order.config` is one `CakeConfig`,
 * so three cakes are still three orders with three references and three places
 * on the kitchen board. Three cakes are three things to bake.
 *
 * ## Pressing the button twice
 *
 * The button disables itself while a request is in flight, which is manners
 * rather than protection: it does nothing about a refresh mid-request, a retry
 * after a timeout, or a phone that did not repaint before the second tap. What
 * protects the customer is the idempotency key below — one per basket, held
 * across retries — which the server turns into the order references themselves,
 * so a second send lands on the first send's rows instead of beside them. See
 * app/api/orders.
 *
 * ## The number on the button
 *
 * Confirmed with the server before the button is enabled, and sent back with
 * the order as the price the customer was *shown*. If the bakery has repriced
 * in between, the server refuses the basket and says so rather than quietly
 * charging the new number — see lib/checkout's `reviewBasket`.
 *
 * ## The rules this form checks
 *
 * `nameOk` and `phoneOk` are imported from lib/checkout, which is the module
 * app/api/orders validates with. The phone regex used to be written out here,
 * in app/build/review and in the route handler — three copies of one rule, and
 * two chances for this button to accept what the server refuses.
 */

/**
 * What the button is doing, which is only ever about *submitting*.
 *
 * Whether the price has been confirmed is deliberately not in here. It is
 * derived below from whether the server's answer belongs to the basket
 * currently on screen, so there is no state to keep in step with the cart and
 * no effect that has to remember to reset it.
 */
type Submit =
  | { kind: "idle" }
  | { kind: "placing" }
  | { kind: "placed"; refs: string[]; totalPaise: number }
  /** `review` marks a refusal the customer can fix by looking at the basket. */
  | { kind: "error"; message: string; review: boolean };

/**
 * The server's answer, tagged with the basket it was an answer *to*.
 *
 * A bare total goes stale silently: change the delivery slot and the number on
 * the button is still the one confirmed for the previous slot, with nothing to
 * say so. Comparing the tag against the current basket makes "is this
 * confirmed" a question with one correct answer at every moment.
 *
 * It carries the subtotal and the GST as well as the total now, because the
 * review panel shows all three and every one of them has to be the server's
 * arithmetic rather than the browser's.
 */
type Confirmed = {
  signature: string;
  /** Per line, in basket order, quantity included. */
  each: number[];
  subtotal: number;
  gst: number;
  total: number;
  productSubtotal: number;
  deliveryFee: number;
};
type PriceFailure = { signature: string; message: string };

function futureDate(days = 7): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function CheckoutForm({
  catalog,
  cakes,
}: {
  catalog: CatalogSnapshot;
  /** Everything on sale, from the server. A basket line whose slug is missing
      from this list names a cake that has been withdrawn or deleted, and the
      page refuses to check out rather than quoting a price for it. */
  cakes: CakeProductView[];
}) {
  const hydrated = useCartHydrated();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"delivery" | "pickup">("delivery");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("Hyderabad");
  const [stateName, setStateName] = useState("Telangana");
  const [requestedDate, setRequestedDate] = useState(() => futureDate());
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [occasion, setOccasion] = useState("");
  const [touched, setTouched] = useState(false);
  const [submit, setSubmit] = useState<Submit>({ kind: "idle" });
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [priceFailure, setPriceFailure] = useState<PriceFailure | null>(null);
  /* Bumped when the server tells us our quote is out of date, so the effect
     below re-asks rather than sitting on the answer it already has. */
  const [requote, setRequote] = useState(0);

  /*
   * The slot and the pincode are decided once for the whole basket and written
   * onto every cake, because one checkout is one delivery. A cake added with a
   * different slot on its own page is overridden here, which is what anybody
   * who has used a shop expects.
   *
   * `null` means "nobody has chosen yet", and the fallback is the first cake's
   * own answer. That is why these are not seeded by an effect: an effect would
   * run after the first paint (so the select would visibly jump), it would fire
   * again every time the cart changed (so it would overwrite a choice already
   * made), and it is a `setState` in an effect body, which is a cascading
   * render the linter is right to refuse.
   */
  const [chosenSlot, setChosenSlot] = useState<DeliverySlot | null>(null);
  const [chosenPincode, setChosenPincode] = useState<string | null>(null);
  const first = lines[0]?.choices;
  const delivery: DeliverySlot = method === "pickup"
    ? "pickup"
    : ((chosenSlot === "pickup" ? null : chosenSlot) ?? (first?.delivery === "pickup" ? null : first?.delivery) ?? "standard") as DeliverySlot;
  const pincode = method === "delivery" ? (chosenPincode ?? first?.pincode ?? "") : "";

  /**
   * Each basket line matched to the cake it names, and the choices it will be
   * ordered with.
   *
   * The cake comes off the list the server sent; the basket contributes a slug,
   * a message and a quantity and nothing else. A line whose slug is not in the
   * list has `cake: undefined` — a cake withdrawn or deleted while the basket
   * sat in this browser — and it blocks checkout below rather than being priced
   * at zero or silently dropped.
   */
  const bySlug = useMemo(() => new Map(cakes.map((c) => [c.slug, c])), [cakes]);

  const resolved = useMemo(
    () =>
      lines.map((l) => {
        const cake = bySlug.get(l.slug);
        /* The variant as the server has it now, by id. A line whose size has
           been withdrawn since it went in the basket resolves to undefined and
           blocks checkout below, exactly as a withdrawn cake does — the two are
           one case from here on, and `reviewBasket` refuses both. */
        const variant = cake ? variantById(cake, l.variantId) : undefined;
        return {
          line: l,
          cake,
          variant: variant?.isAvailable ? variant : undefined,
          /* The slot and the pincode are the basket's, not the line's — one
             checkout is one delivery. The message stays the line's own. */
          choices: {
            ...l.choices,
            delivery,
            ...(/^\d{6}$/.test(pincode) ? { pincode } : { pincode: undefined }),
          } as CakeChoices,
        };
      }),
    [lines, bySlug, delivery, pincode],
  );

  const missing = resolved.filter((r) => !r.cake || !r.variant).length;

  /* What "this basket, priced this way" is, as one string. Quantities are in it
     because two of a cake is twice the money and therefore a different total. */
  const signature = useMemo(
    () =>
      JSON.stringify({
        lines: resolved.map((r) => [r.line.slug, r.line.variantId, r.choices, r.line.qty]),
        fulfillment: {
          method, name, phone, addressLine1, addressLine2, landmark, city, stateName,
          pincode, requestedDate, deliveryInstructions, customerNotes, occasion,
        },
      }),
    [
      resolved, method, name, phone, addressLine1, addressLine2, landmark, city,
      stateName, pincode, requestedDate, deliveryInstructions, customerNotes, occasion,
    ],
  );

  /**
   * One checkout attempt, named.
   *
   * Minted per basket and kept across retries, which is exactly the opposite of
   * minting one per request: a retry carrying a new key would be a new
   * intention as far as the server is concerned, and would write the cake
   * again. Changing the basket changes the signature and earns a new key,
   * because that genuinely is a different order.
   *
   * A ref rather than state: reading it must not schedule a render, and it has
   * to survive the re-render `setSubmit` causes between the click and the fetch.
   */
  function idempotencyKey(): string {
    const storageKey = "makemycake.checkoutAttempt";
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
        signature?: string;
        key?: string;
      } | null;
      if (stored?.signature === signature && typeof stored.key === "string") return stored.key;
      const key = crypto.randomUUID();
      localStorage.setItem(storageKey, JSON.stringify({ signature, key }));
      return key;
    } catch {
      return crypto.randomUUID();
    }
  }

  const slot = resolveSlot(delivery, pincode || undefined, catalog);

  /* The browser's own arithmetic, shown only until the server answers. A line
     whose cake has gone contributes nothing — there is no price to estimate. */
  const estimate = useMemo(
    () =>
      resolved.map((r) =>
        r.cake && r.variant
          ? priceProduct(
              { name: r.cake.name, pricePaise: r.variant.pricePaise },
              r.choices,
              catalog,
            ).total * r.line.qty
          : 0,
      ),
    [resolved, catalog],
  );

  /*
   * The client's number is an estimate until the server agrees with it. One
   * request per line, in parallel, on every change to the basket or the
   * delivery choice — and again when the server tells us the catalogue moved.
   */
  useEffect(() => {
    if (!hydrated || resolved.length === 0 || missing > 0) return;
    if (!requestedDate || (method === "delivery" && !/^\d{6}$/.test(pincode))) return;
    let cancelled = false;
    /* Nothing is set synchronously here. "Checking" is the *absence* of a
       confirmation for this signature, so the effect has only to record an
       answer when one arrives — and a stale answer for a previous basket stops
       counting the instant the signature changes, with nothing to reset. */
    const asked = signature;
    fetch("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fulfillment: { method, slot: delivery, pincode: pincode || undefined, requestedDate },
        items: resolved.map((r) => ({
          cakeSlug: r.line.slug,
          variantId: r.line.variantId,
          choices: r.choices,
          qty: r.line.qty,
        })),
      }),
    })
      .then(async (response) => response.ok ? response.json() : Promise.reject(await response.json()))
      .then((data) => {
        if (cancelled) return;
        const quote = data?.quote;
        if (!quote || typeof quote.totalPaise !== "number" || !Array.isArray(quote.each)) {
          setPriceFailure({ signature: asked, message: "We couldn't confirm the price. Try again in a moment." });
          return;
        }
        setConfirmed({
          signature: asked,
          each: quote.each,
          productSubtotal: quote.productSubtotalPaise,
          deliveryFee: quote.deliveryFeePaise,
          subtotal: quote.subtotalPaise,
          gst: quote.gstPaise,
          total: quote.totalPaise,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setPriceFailure({
          signature: asked,
          message: error?.error ?? "We couldn't reach the kitchen to confirm the price.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, resolved, missing, signature, requote, method, delivery, pincode, requestedDate]);

  /* Derived, never stored: an answer counts only for the basket it answered. */
  const priceConfirmed = confirmed?.signature === signature;
  const priceError = priceFailure?.signature === signature ? priceFailure.message : null;
  const estimatedProductSubtotal = resolved.reduce((sum, r) => {
    if (!r.cake || !r.variant) return sum;
    return sum + priceProduct(
      { name: r.cake.name, pricePaise: r.variant.pricePaise },
      r.choices,
      catalog,
    ).subtotal * r.line.qty;
  }, 0);
  const estimatedDelivery = catalog.price.deliveryFee[delivery] ?? 0;
  const estimatedSubtotal = estimatedProductSubtotal + estimatedDelivery;
  const total = priceConfirmed
    ? confirmed.total
    : estimatedSubtotal + Math.round(estimatedSubtotal * catalog.settings.gstRate);

  const contactOk = nameOk(name) && phoneOk(phone);
  const fulfillmentOk = method === "pickup"
    ? Boolean(requestedDate)
    : /^\d{6}$/.test(pincode)
      && addressLine1.trim().length >= 3
      && city.trim().length >= 2
      && stateName.trim().length >= 2
      && Boolean(requestedDate);
  const ready =
    contactOk && fulfillmentOk && slot.available && priceConfirmed && lines.length > 0 && missing === 0;

  async function place() {
    /* Narrowed rather than asserted: `ready` already requires it, and a second
       reading here is what lets the body use `confirmed` without a `!`. */
    if (!confirmed || confirmed.signature !== signature) return;
    const quote = confirmed;

    setSubmit({ kind: "placing" });

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey(),
          customerName: name,
          customerPhone: phone,
          fulfillment: {
            method,
            slot: delivery,
            recipientName: name,
            requestedDate,
            requestedWindow: slot.window,
            ...(method === "delivery"
              ? {
                  addressLine1,
                  addressLine2: addressLine2 || undefined,
                  landmark: landmark || undefined,
                  city,
                  state: stateName,
                  pincode,
                  deliveryInstructions: deliveryInstructions || undefined,
                }
              : {}),
            customerNotes: customerNotes || undefined,
            occasion: occasion || undefined,
          },
          /*
           * A slug and three choices per line, and nothing else.
           *
           * A slug, a variant id and three choices per line, and nothing else.
           *
           * No name, no price, no size, no photograph, no recipe — the server
           * looks the cake and the variant up and reads all of those off the
           * rows. This body cannot express "Chocolate Truffle costs ₹1" because
           * there is no field in it for a price at all, and it cannot borrow a
           * cheaper cake's variant because the lookup is scoped to the cake the
           * slug names. `quotedTotalPaise` is the customer's claim about what
           * they were *shown*, and the only thing done with it is a comparison
           * that can stop the order. See lib/checkout.
           */
          items: resolved.map((r, i) => ({
            cakeSlug: r.line.slug,
            variantId: r.line.variantId,
            choices: r.choices,
            qty: r.line.qty,
            /* What this cake was quoted at, for one — the server multiplies by
               the quantity itself. Divided back out of the confirmed line total
               so the number sent is the number that was shown. */
            quotedTotalPaise: Math.round(quote.each[i] / r.line.qty),
          })),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        /*
         * A refusal the basket can fix — the catalogue moved, or an option was
         * withdrawn — sends the customer back to look rather than letting them
         * press the same button again. The quote is thrown away and re-asked,
         * so the panel is showing today's price by the time they read the
         * message.
         */
        const review =
          data?.code === "price_changed" ||
          data?.code === "option_unavailable" ||
          data?.code === "cake_unavailable";
        if (review) {
          setConfirmed(null);
          setRequote((n) => n + 1);
        }
        setSubmit({
          kind: "error",
          review,
          message: data?.error ?? "The kitchen turned that one down.",
        });
        return;
      }

      const refs: string[] = data?.order?.ref
        ? [data.order.ref]
        : Array.isArray(data?.orders)
          ? data.orders.map((o: { ref: string }) => o.ref)
          : [];

      /*
       * Cleared here and nowhere else: after the server has said the rows are
       * written, never before and never on a failure. A cart emptied by an
       * error is a customer retyping a basket they had already built.
       */
      /*
       * Read before `clear()`, and the SERVER's total rather than `priceCake`
       * re-run in a browser whose cart is about to stop existing. Both would
       * agree today; only one of them is the number the order was written at,
       * and a confirmation that recomputes its own total is a confirmation that
       * can disagree with the row the kitchen bakes from.
       *
       * One number and not a receipt: the confirmation is a moment on the way
       * to /orders/[ref], which lists every frozen line, the delivery window
       * and the real status. Printing the basket twice — once on a screen that
       * navigates away in under three seconds — is the itemisation nobody
       * reads, in front of the one they do.
       */
      const totalPaise = quote.total;

      localStorage.removeItem("makemycake.checkoutAttempt");
      clear();
      setSubmit({ kind: "placed", refs, totalPaise });
    } catch {
      /*
       * The request did not complete — which does not mean it did not land. The
       * cart is deliberately left alone, and pressing the button again is safe:
       * the same idempotency key produces the same references, so a retry after
       * an order that actually got through returns that order rather than
       * placing a second one.
       */
      setSubmit({
        kind: "error",
        review: false,
        message: "That didn't send. Check your connection and try again; this won't order twice.",
      });
    }
  }

  if (submit.kind === "placed") {
    return <OrderPlaced refs={submit.refs} totalPaise={submit.totalPaise} />;
  }

  if (!hydrated) {
    /* The same `h-64` as before, so nothing below the fold moves when the cart
       is read — only what is drawn inside it has changed. */
    return <BakingPanel label="Getting your basket…" className={`${sCard} h-64`} />;
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5 rounded-s border border-dashed border-s-line-strong bg-s-shell px-6 py-16">
        <h2 className="text-[1.75rem]">There is nothing to check out</h2>
        <p className="max-w-[46ch] text-s-bark">Add a cake to the cart first.</p>
        <Link href="/shop" className={sBtn("primary", "lg")}>
          Shop cakes
        </Link>
      </div>
    );
  }

  const nameBad = touched && !nameOk(name);
  const phoneBad = touched && !phoneOk(phone);
  const placing = submit.kind === "placing";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <form
        className="flex flex-col gap-7"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (ready && !placing) void place();
        }}
        noValidate
      >
        {/* ── Who we call ────────────────────────────────────────────── */}
        <section className={`${sCard} flex flex-col gap-4 p-5 sm:p-6`}>
          <div>
            <h2 className="text-[1.375rem]">Who is this for?</h2>
            <p className="mt-1 text-[0.875rem] text-s-bark">
              We call this number to confirm the cake and the exact delivery
              address before anything goes in the oven.
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
              Name
            </span>
            <input
              value={name}
              autoComplete="name"
              required
              disabled={placing}
              aria-invalid={nameBad}
              aria-describedby={nameBad ? "checkout-name-error" : undefined}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who is collecting?"
              className={sField()}
            />
            {nameBad && (
              <span id="checkout-name-error" className="text-[0.8125rem] text-s-berry">
                We need a name for the order.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
              Phone
            </span>
            <input
              inputMode="tel"
              autoComplete="tel"
              required
              disabled={placing}
              value={phone}
              aria-invalid={phoneBad}
              aria-describedby={phoneBad ? "checkout-phone-error" : undefined}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10 digits"
              className={sField("font-mono tabular-nums")}
            />
            {phoneBad && (
              <span id="checkout-phone-error" className="text-[0.8125rem] text-s-berry">
                A 10-digit Indian mobile number, so we can confirm the order.
              </span>
            )}
          </label>
        </section>

        {/* ── Where and when ─────────────────────────────────────────── */}
        <section className={`${sCard} flex flex-col gap-4 p-5 sm:p-6`}>
          <div>
            <h2 className="text-[1.375rem]">Where and when</h2>
            <p className="mt-1 text-[0.875rem] text-s-bark">
              One fulfillment plan and one delivery fee for the whole order.
            </p>
          </div>

          <fieldset className="grid grid-cols-2 gap-2 border-0 p-0">
            <legend className="sr-only">Fulfillment method</legend>
            {(["delivery", "pickup"] as const).map((value) => (
              <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-s-sm border px-4 ${method === value ? "border-s-berry bg-s-berry-wash" : "border-s-line-strong"}`}>
                <input
                  type="radio"
                  name="fulfillmentMethod"
                  value={value}
                  checked={method === value}
                  disabled={placing}
                  onChange={() => {
                    setMethod(value);
                    if (value === "pickup") setChosenSlot("pickup");
                    else if (chosenSlot === "pickup") setChosenSlot("standard");
                  }}
                />
                <span className="capitalize">{value}</span>
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
              Slot
            </span>
            <select
              value={delivery}
              disabled={placing}
              onChange={(e) => setChosenSlot(e.target.value as DeliverySlot)}
              className={sField()}
            >
              {DELIVERY_OPTIONS.filter((o) => method === "pickup" ? o.value === "pickup" : o.value !== "pickup").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.name} ({o.blurb})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
              Requested date
            </span>
            <input
              type="date"
              value={requestedDate}
              min={new Date().toISOString().slice(0, 10)}
              required
              disabled={placing}
              onChange={(e) => setRequestedDate(e.target.value)}
              className={sField("font-mono")}
            />
          </label>

          {method === "delivery" && (
            <div className="grid gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">Address line 1</span>
                <input value={addressLine1} required autoComplete="address-line1" disabled={placing} onChange={(e) => setAddressLine1(e.target.value)} className={sField()} placeholder="Flat, building and street" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">Address line 2 <span className="normal-case tracking-normal">(optional)</span></span>
                <input value={addressLine2} autoComplete="address-line2" disabled={placing} onChange={(e) => setAddressLine2(e.target.value)} className={sField()} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">City</span>
                  <input value={city} required autoComplete="address-level2" disabled={placing} onChange={(e) => setCity(e.target.value)} className={sField()} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">State</span>
                  <input value={stateName} required autoComplete="address-level1" disabled={placing} onChange={(e) => setStateName(e.target.value)} className={sField()} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">Pincode</span>
                  <input inputMode="numeric" autoComplete="postal-code" maxLength={6} required disabled={placing} value={pincode} aria-invalid={!slot.available} aria-describedby="checkout-slot-note" onChange={(e) => setChosenPincode(e.target.value.replace(/\D/g, ""))} placeholder="500081" className={sField("font-mono tabular-nums")} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">Landmark <span className="normal-case tracking-normal">(optional)</span></span>
                  <input value={landmark} disabled={placing} onChange={(e) => setLandmark(e.target.value)} className={sField()} />
                </label>
              </div>
            </div>
          )}

          <span
            id="checkout-slot-note"
            className={`text-[0.8125rem] ${slot.available ? "text-s-bark" : "text-s-berry"}`}
            role={slot.available ? undefined : "alert"}
          >
            {slot.unavailableReason
              ?? `${slot.name} · ready about ${slot.effectiveLeadHours} hours after we confirm${slot.zoneName ? ` · ${slot.zoneName}` : ""}.`}
          </span>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">Occasion <span className="normal-case tracking-normal">(optional)</span></span>
            <input value={occasion} disabled={placing} maxLength={80} onChange={(e) => setOccasion(e.target.value)} className={sField()} placeholder="Birthday, anniversary…" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">Order notes <span className="normal-case tracking-normal">(optional)</span></span>
            <textarea value={customerNotes} disabled={placing} maxLength={1000} rows={3} onChange={(e) => setCustomerNotes(e.target.value)} className={sField("resize-y")} />
          </label>
          {method === "delivery" && (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">Delivery instructions <span className="normal-case tracking-normal">(optional)</span></span>
              <textarea value={deliveryInstructions} disabled={placing} maxLength={500} rows={2} onChange={(e) => setDeliveryInstructions(e.target.value)} className={sField("resize-y")} />
            </label>
          )}
        </section>

        {/*
          Three failures, one place to read them: the price check could not
          reach the kitchen, the order was turned down for something the basket
          can fix, or it was turned down for something else. The first two carry
          a way out rather than only an apology — and the colour is never the
          only signal, since the text says what happened on its own.
        */}
        {(priceError || submit.kind === "error") && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-s-sm border border-s-berry/40 bg-s-berry-wash px-4 py-3 text-[0.9375rem] text-s-berry"
          >
            <p>{submit.kind === "error" ? submit.message : priceError}</p>
            {submit.kind === "error" && submit.review && (
              <Link href="/cart" className={sBtn("outline", "sm")}>
                Review your cart
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          /*
           * Two different refusals, and only one of them is `disabled`.
           *
           * In flight the button is genuinely disabled: a second press must not
           * fire, full stop. Not-yet-ready is a different thing — it usually
           * means the name or the number is missing — and a truly disabled
           * control cannot be focused, so the form ended in a dead button with
           * nothing saying why, and the field errors below were unreachable.
           * `aria-disabled` leaves it focusable and inert: pressing it marks the
           * fields touched and the messages appear, which is the answer the
           * customer was after. components/admin/ui.tsx makes the same call in
           * the same words, and `sBtn`'s `OFF` already styles the aria form
           * identically to the real one.
           */
          disabled={placing}
          aria-disabled={!ready}
          /* Announced as well as shown: somebody on a screen reader gets the
             same "it is working" the changed label gives everybody else. */
          aria-busy={placing}
          className={sBtn("primary", "lg", "w-full lg:w-fit lg:min-w-[18rem]")}
        >
          {placing && <BakingMark size="sm" />}
          {placing ? "Placing your order…" : `Place order · ${formatINR(total)}`}
        </button>
      </form>

      {/* ── What is being ordered ───────────────────────────────────── */}
      <aside
        aria-label="Order summary"
        className={`${sCard} flex flex-col gap-4 p-5 lg:sticky lg:top-[84px]`}
      >
        <h2 className="text-[1.375rem]">Your order</h2>

        <ul className="flex flex-col gap-3">
          {resolved.map(({ line, cake, variant, choices }, i) => (
            <li
              key={line.id}
              className="flex justify-between gap-3 border-b border-s-line pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-medium text-s-cocoa">
                  {/* The cake's current name, from the row. It is frozen onto
                      the order at the moment it is placed, not here. */}
                  {cake?.name ?? line.slug}{" "}
                  {line.qty > 1 && <span className="text-s-bark">× {line.qty}</span>}
                </p>
                {cake && variant ? (
                  <p className="text-[0.75rem] leading-snug text-s-bark">
                    {variantLabel(variant)}
                  </p>
                ) : (
                  <p role="alert" className="text-[0.75rem] leading-snug text-s-berry">
                    {cake
                      ? "That size or sponge is no longer available — change it in your cart."
                      : "No longer available — remove it from your cart."}
                  </p>
                )}
                {choices.message && (
                  <p className="text-[0.75rem] leading-snug text-s-bark">
                    Message: “{choices.message}”
                  </p>
                )}
              </div>
              <span className="shrink-0 font-mono text-[0.875rem] tabular-nums">
                {cake && variant
                  ? formatINR(priceConfirmed ? (confirmed.each[i] ?? estimate[i]) : estimate[i])
                  : "—"}
              </span>
            </li>
          ))}
        </ul>

        {/*
          Subtotal, GST and total, all three from the server's own answer rather
          than re-derived here. §18 asks for the tax to be visible before
          somebody commits, and a figure the browser worked out for itself is
          exactly the figure this whole flow exists to stop trusting. An em dash
          while the answer is in flight, because a placeholder number that later
          changes is worse than an obvious gap.
        */}
        <dl className="flex flex-col gap-2 border-t border-s-line pt-3 text-[0.875rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-s-bark">Products</dt>
            <dd className="font-mono tabular-nums">
              {priceConfirmed ? formatINR(confirmed.productSubtotal) : "..."}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-s-bark">{method === "pickup" ? "Pickup" : "Delivery"}</dt>
            <dd className="font-mono tabular-nums">
              {priceConfirmed ? (confirmed.deliveryFee ? formatINR(confirmed.deliveryFee) : "Included") : "..."}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-s-bark">GST ({Math.round(catalog.settings.gstRate * 100)}%)</dt>
            <dd className="font-mono tabular-nums">
              {priceConfirmed ? formatINR(confirmed.gst) : "..."}
            </dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-s-line pt-3">
            <dt className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
              Total
            </dt>
            <dd className="font-mono text-[1.375rem] font-medium tabular-nums">
              {formatINR(total)}
            </dd>
          </div>
        </dl>

        <p className="flex items-center gap-2 text-[0.8125rem] text-s-bark" aria-live="polite">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${priceConfirmed ? "bg-s-done" : "bg-s-gold"}`}
          />
          {priceConfirmed
            ? "Price confirmed with the kitchen."
            : "Confirming with the kitchen…"}
        </p>

        <p className="text-[0.8125rem] leading-relaxed text-s-bark">
          No payment now.{" "}
          {lines.length > 1 && "Each cake gets its own reference so you can track it."}
        </p>
      </aside>
    </div>
  );
}
