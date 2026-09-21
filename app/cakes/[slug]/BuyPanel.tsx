"use client";

import { useEffect, useMemo, useState } from "react";
import { AddToCart } from "@/components/shop/AddToCart";
import { PriceRoll } from "@/components/shop/PriceRoll";
import { useVariantPick, VariantChoices } from "@/components/shop/VariantPicker";
import { MAX_QTY } from "@/lib/cart";
import type { CakeChoices, CakeProductView } from "@/lib/cakes";
import { cheapestVariant, configForVariant, variantLabel } from "@/lib/cakes";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { formatINR } from "@/lib/format";
import { priceProduct } from "@/lib/pricing";
import { deriveServings } from "@/lib/servings";
import { sBtn, sField } from "@/lib/shopUi";

/**
 * Everything a shopper decides about one cake, and the two buttons that end it.
 *
 * ## The size and the sponge are back, and this time they are priced
 *
 * They were here once as `CakeConfig` fields, and `priceCake` moved the total
 * with them — so the price of Chocolate Truffle at 2 kg was an arithmetic
 * consequence of the builder's option table rather than a number the bakery had
 * ever agreed to. They came off. They are back as `CakeVariant` rows: each
 * combination is a price an owner typed at /admin/cakes, and choosing one is
 * choosing a row rather than running a formula.
 *
 * ## It is the same control the card opens
 *
 * `useVariantPick` and `<VariantChoices>` are shared with the bottom sheet, and
 * that is §13's requirement met structurally: there is no second selection rule
 * that could disagree about what is offered, what is required, or which variant
 * a pair of clicks adds up to. What this panel adds around them is the rest of
 * the page's job — the message, the slot, the pincode and the quantity.
 *
 * ## The price here is an estimate and the server decides
 *
 * `priceProduct` runs against the row and the catalogue this page's Server
 * Component fetched, which is the database's answer at render time.
 * `/api/orders` prices against the row as it is at *order* time and freezes
 * that onto the order. The server has always been the authority and still is.
 *
 * ## The rules
 *
 * `validateCake` is the same engine the builder uses, run against the config
 * this cake would be ordered as — so a combination the kitchen refuses is
 * refused here rather than discovered by the API returning 422. For a seeded
 * cake that is its real recipe at the chosen size; for an owner-added one it is
 * the plain derived config, which passes. Blockers disable the buttons;
 * warnings are printed. Nothing is validated until a variant is chosen, because
 * until then there is no cake to validate.
 */
export function BuyPanel({
  product,
  catalog,
}: {
  product: CakeProductView;
  catalog: CatalogSnapshot;
}) {
  const pick = useVariantPick(product, cheapestVariant(product)?.id);
  const { variant } = pick;

  const [message, setMessage] = useState("");
  const [qty, setQty] = useState(1);

  /* One object, derived. Keeping three pieces of state and assembling the
     choices in three places is how two of them end up disagreeing. */
  const choices: CakeChoices = useMemo(
    () => ({
      delivery: "standard",
      ...(message.trim() ? { message: message.trim() } : {}),

    }),
    [message],
  );

  /* Nothing is priced and nothing is validated until there is a variant: an
     unchosen cake has no price, and quoting one would mean picking a size on the
     shopper's behalf. Both fall out of the same null. */
  const config = variant ? configForVariant(product, variant, choices) : null;
  const initialPrice = variant
    ? priceProduct({ name: product.name, pricePaise: variant.pricePaise }, choices, catalog)
    : null;

  const [price, setPrice] = useState(initialPrice);
  const [isPricing, setIsPricing] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function updatePrice() {
      await Promise.resolve(); // push to microtask queue to avoid synchronous setState inside effect
      if (!active) return;

      if (!variant) {
        setPrice(null);
        setPriceError(null);
        return;
      }

      setIsPricing(true);
      setPriceError(null);

      try {
        const res = await fetch("/api/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cakeSlug: product.slug,
            variantId: variant.id,
            choices,
          }),
        });
        const data = await res.json();
        if (!active) return;

        if (!res.ok) {
          setPriceError(data.error || "Failed to calculate price");
        } else {
          setPrice(data.price);
          setPriceError(null);
        }
      } catch {
        if (active) setPriceError("Network error calculating price");
      } finally {
        if (active) setIsPricing(false);
      }
    }

    void updatePrice();

    return () => {
      active = false;
    };
  }, [product.slug, variant, choices]);

  const ready = Boolean(variant?.isAvailable && product.isAvailable && product.productionSpec);

  /* Servings move with the chosen size, at the 100g portions lib/servings
     states out loud. `deriveServings` takes a whole config, which is exactly
     what `config` is once a variant is settled. */
  const servings = config ? deriveServings(config) : null;

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {/*
          The figure rolls to its new value rather than being swapped for it —
          see PriceRoll. It is the feedback the size, sponge, message and
          delivery controls give that they did anything, and it is the same
          control the card's sheet prints its total with.

          `aria-live="polite"` for the same reason in the other channel. It sits
          on the wrapper rather than on the figure, because a live region that is
          itself replaced on every change never announces anything.
        */}
        {price ? (
          <div className={`transition-opacity duration-[var(--dur-ui)] ${isPricing ? "opacity-50" : "opacity-100"}`}>
            <PriceRoll
              text={formatINR(price.total * qty)}
              className="font-mono text-[2rem] font-medium text-s-cocoa tabular-nums"
            />
          </div>
        ) : (
          <span
            aria-hidden
            className="font-mono text-[2rem] leading-none font-medium text-s-bark/40 tabular-nums"
          >
            &mdash;
          </span>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[0.75rem] tracking-[0.1em] text-s-bark uppercase">
            {price
              ? `incl. GST${servings ? ` · serves ${servings.min}-${servings.max}` : ""}`
              : "Choose a size to see the price"}
          </span>
          {priceError && (
            <span role="alert" className="text-[0.8125rem] font-medium text-s-berry">
              {priceError}
            </span>
          )}
        </div>
      </div>

      {/* ── Which cake ────────────────────────────────────────────────── */}
      {/* The card's sheet and this panel run the identical control. §13. */}
      <div className="border-y border-s-line py-5">
        {pick.soldOut ? (
          <p role="alert" className="text-[0.9375rem] leading-relaxed text-s-berry">
            Every size of this cake is off the shelf at the moment.
          </p>
        ) : (
          <VariantChoices
            product={product}
            catalog={catalog}
            pick={pick}
            idPrefix="buy"
          />
        )}
      </div>

      {/* ── Message ───────────────────────────────────────────────────── */}
      <Group label="Message on the cake" hint="Optional. Up to 60 characters.">
        <input
          value={message}
          /* Enforced here as well as in Zod, so the field simply stops rather
             than letting somebody type a sentence the schema will reject. */
          maxLength={60}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Happy Birthday Amma"
          aria-label="Message on the cake"
          className={sField()}
        />
      </Group>

      <div className="rounded-s bg-s-cream-deep p-4 text-sm text-s-bark">Choose delivery or bakery pickup at checkout. We verify your pincode, requested date and delivery price there.</div>

      {/* ── Quantity + the two actions ────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-t border-s-line pt-6">
        <div className="flex items-center gap-3">
          <span id="qty-label" className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
            Quantity
          </span>
          <div className="inline-flex items-center rounded-s-sm border border-s-line-strong bg-s-shell">
            <button
              type="button"
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              disabled={qty <= 1}
              aria-label="One fewer"
              className="inline-flex size-11 items-center justify-center text-s-cocoa disabled:text-s-bark/40"
            >
              −
            </button>
            <span aria-labelledby="qty-label" className="w-8 text-center font-mono tabular-nums">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}
              disabled={qty >= MAX_QTY}
              aria-label="One more"
              className="inline-flex size-11 items-center justify-center text-s-cocoa disabled:text-s-bark/40"
            >
              +
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {/*
            A direct add, not the sheet. This panel *is* the sheet's contents,
            spread over a page that has room for them — opening a dialog over a
            question already answered on screen would be asking twice.

            `variantId` is what makes the button impossible to press early: it is
            undefined until both halves are settled, and `disabled` reads it.
          */}
          <AddToCart
            slug={product.slug}
            variantId={variant?.id}
            choices={choices}
            qty={qty}
            disabled={!ready || !variant || isPricing || Boolean(priceError)}
            variant="primary"
            size="lg"
            className="w-full"
          />
          <AddToCart
            slug={product.slug}
            variantId={variant?.id}
            choices={choices}
            qty={qty}
            after="checkout"
            disabled={!ready || !variant || isPricing || Boolean(priceError)}
            label="Buy now"
            variant="dark"
            size="lg"
            className="w-full"
          />
        </div>

        {!variant ? (
          <p className="text-[0.875rem] text-s-bark">
            {pick.size === null
              ? "Choose a size to carry on."
              : "Choose how it should be baked to carry on."}
          </p>
        ) : (
          !ready && (
            <p className="text-[0.875rem] text-s-berry">
              This cake is temporarily unavailable while its kitchen specification is reviewed.
            </p>
          )
        )}

        {variant && (
          <p className="font-mono text-[0.75rem] tracking-[0.08em] text-s-bark uppercase">
            {variantLabel(variant)}
          </p>
        )}

        <p className="text-[0.875rem] text-s-bark">
          No payment now. We call to confirm every order before it goes in the oven.
        </p>

        {/*
          The 3D builder's door, and it is shut. Kept visible here because this
          is the screen where somebody wants a cake that is *not* on the shelf —
          that is precisely the customer the builder is for — but it cannot be
          opened yet. A disabled button rather than a link with no href: the
          first is skipped by Tab and announced as dimmed, the second is text a
          keyboard still lands on and a screen reader still calls a link.
        */}
        <div className="mt-2 flex flex-col gap-2 rounded-s-sm border border-dashed border-s-line-strong bg-s-cream-deep/60 px-4 py-4">
          <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
            Want something else entirely?
          </span>
          <p className="text-[0.875rem] leading-snug text-s-bark">
            The 3D Cake Builder lets you design one from scratch. We&rsquo;re putting
            the finishing touches on it.
          </p>
          <button type="button" disabled className={sBtn("outline", "sm", "w-fit")}>
            3D Builder, coming soon
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2.5 border-0 p-0">
      <legend className="mb-1 font-mono text-[0.6875rem] tracking-[0.14em] text-s-bark uppercase">
        {label}
      </legend>
      {children}
      {hint && <p className="text-[0.8125rem] text-s-bark">{hint}</p>}
    </fieldset>
  );
}
