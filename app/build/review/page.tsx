"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StepHeader } from "@/components/builder/StepHeader";
import { ViolationCard } from "@/components/builder/ViolationCard";
import { PriceBreakdown } from "@/components/docket/PriceBreakdown";
import { deriveAllergens } from "@/lib/allergens";
import { resolveSlot } from "@/lib/delivery";
import { buildDocket, deriveLayers, renderSpecSheet } from "@/lib/docket";
import { formatINR } from "@/lib/format";
import { DELIVERED_PHOTOS } from "@/lib/photos";
import { priceCake } from "@/lib/pricing";
import { canSubmit } from "@/lib/rules";
import type { CakeConfig } from "@/lib/schema";
import { encodeConfig } from "@/lib/share";
import { deriveHandling, deriveServings } from "@/lib/servings";
import { useConfig } from "@/lib/store";
import { btn, eyebrow, field, monoField } from "@/lib/ui";

type Stage =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "mismatch"; serverTotal: number }
  | { kind: "placing" }
  | { kind: "placed"; ref: string }
  | { kind: "error"; message: string };

/**
 * The payoff.
 *
 * Every previous step spends the customer's attention; this is the one screen
 * that has to give something back. It used to be nine grey `text-meta` section
 * headings and a row of four identically-weighted 34px buttons, one of which
 * was the only thing the whole product exists to do. The total and the order
 * button now sit together on the one ink surface in the flow, with the price
 * stated at the size it matters at, and everything else is supporting evidence
 * arranged under it.
 */
export default function ReviewStep() {
  const config = useConfig();
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  /*
   * The saved link and its slug belong to the design they were saved from, so
   * the config is kept alongside them. The store replaces the config object on
   * every change, so comparing it by reference during render is what makes a
   * stale link disappear — no effect, and so no cascading render.
   */
  const [saved, setSaved] = useState<
    { config: CakeConfig; slug: string; url: string } | null
  >(null);
  const share = saved?.config === config ? saved : null;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const price = priceCake(config);
  const docket = buildDocket(config);
  const allergens = deriveAllergens(config);
  const servings = deriveServings(config);
  const layers = deriveLayers(config);
  const handling = deriveHandling(config);
  const slot = resolveSlot(config.delivery, config.pincode);
  // The server refuses an order with no name or no reachable number, so the
  // button has to know that too — otherwise the only way to find out is to press
  // the primary action and be told no.
  const contactOk =
    name.trim().length >= 2 &&
    /^(?:\+?91|0)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ""));
  const ready = canSubmit(config) && contactOk;

  // The client number is an estimate until the server agrees with it.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    })
      .then(r => r.json())
      .then((data) => {
        if (cancelled) return;
        const serverTotal = data?.price?.total;
        if (typeof serverTotal !== "number") {
          setStage({ kind: "error", message: "We couldn't confirm the price. Try again in a moment." });
          return;
        }
        setStage(serverTotal === price.total
          ? { kind: "idle" }
          : { kind: "mismatch", serverTotal });
      })
      .catch(() => {
        if (!cancelled) {
          setStage({ kind: "error", message: "We couldn't reach the kitchen to confirm the price." });
        }
      });

    return () => { cancelled = true; };
  }, [config, price.total]);

  async function place() {
    setStage({ kind: "placing" });
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config,
          clientTotal: price.total,
          customerName: name,
          customerPhone: phone,
          // /api/orders has always resolved this to Order.designId. Nothing
          // ever sent it, so saving a design and then ordering it produced two
          // rows with nothing joining them.
          designSlug: share?.slug,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStage({ kind: "error", message: data?.error ?? "The kitchen turned that one down." });
        return;
      }
      setStage({ kind: "placed", ref: data.orderId });
    } catch {
      setStage({ kind: "error", message: "That didn't send. Check your connection and try again." });
    }
  }

  async function save() {
    try {
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      /*
       * There was no failure branch here at all. With no database attached —
       * which is the documented state of the deployment — the endpoint answers
       * 503 with a perfectly good explanation, and the button silently did
       * nothing and said nothing.
       */
      if (!res.ok) {
        setStage({
          kind: "error",
          message: data?.error ?? "That design couldn't be saved.",
        });
        return;
      }
      setSaved({ config, slug: data.slug, url: `${window.location.origin}${data.url}` });
    } catch {
      setStage({
        kind: "error",
        message: "That didn't send. Check your connection and try again.",
      });
    }
  }

  function download() {
    const blob = new Blob([renderSpecSheet(config, { ref: stage.kind === "placed" ? stage.ref : undefined })], {
      type: "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `makemycake-${docket.ref}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (stage.kind === "placed") {
    return (
      <Placed
        reference={stage.ref}
        onDownload={download}
        slotName={slot.name}
        leadHours={slot.effectiveLeadHours}
      />
    );
  }

  const priceNote =
    stage.kind === "checking"
      ? "Confirming with the kitchen…"
      : stage.kind === "mismatch"
        ? `Kitchen says ${formatINR(stage.serverTotal)} — that is the price that stands.`
        : "Confirmed against the kitchen's own pricing.";

  return (
    <div className="flex flex-col gap-5">
      <StepHeader title="Review your cake" hint="Everything you chose, itemised." />

      <ViolationCard />

      {/* Who we call. Above the order button, because the button depends on it. */}
      <section className="flex flex-col gap-3.5 border border-rule bg-paper p-5">
        <div className="flex flex-col gap-[3px]">
          <h2 className="text-group font-sans font-medium tracking-[-0.01em]">
            Who is this for?
          </h2>
          <p className="text-meta text-steel">
            We call this number to confirm before we bake.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-mono text-micro tracking-[0.14em] text-steel">NAME</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is collecting?"
            className={field()}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-micro tracking-[0.14em] text-steel">PHONE</span>
          <input
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10 digits"
            className={monoField()}
          />
        </label>
      </section>

      {/* The one ink surface in the flow, and the reason the flow exists. */}
      <section className="flex flex-col gap-4 bg-ink p-6 ">
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-micro tracking-[0.16em] whitespace-nowrap text-quiet">
              TOTAL · INCL. GST
            </span>
            <span
              key={price.total}
              className="font-mono text-[1.625rem] leading-none font-medium text-paper tabular-nums motion-safe:animate-[price-tick_var(--dur-settle)_var(--ease-out)]"
            >
              {formatINR(price.total)}
            </span>
          </div>
          <span className="flex h-[30px] shrink-0 items-center gap-2 border border-graphite px-3 font-mono text-micro tracking-[0.1em] whitespace-nowrap text-quiet">
            <span
              aria-hidden
              className={`size-[5px] ${stage.kind === "idle" ? "bg-[#8FA85E]" : "bg-brass"}`}
            />
            {stage.kind === "idle" ? "PRICE CONFIRMED" : "CHECKING"}
          </span>
        </div>

        <p className="text-meta leading-normal text-quiet">
          {priceNote} No payment now — we call you to confirm the details, then bake.
        </p>

        <button
          type="button"
          onClick={place}
          disabled={!ready || stage.kind === "placing" || stage.kind === "checking"}
          /*
           * `disabled:opacity-45` put white text on a 45%-alpha fill over paper,
           * which measures about 2.25:1 — and this is the state the button is in
           * the moment you arrive, while the server price check runs. Disabled
           * changes the colours, not the alpha.
           */
          className={[
            "flex min-h-14 items-center justify-center bg-paper px-6 text-item font-medium text-ink",
            "transition-colors duration-[--dur-ui] ease-[--ease-out] hover:bg-counter",
            "disabled:cursor-not-allowed disabled:bg-graphite disabled:text-quiet",
          ].join(" ")}
        >
          {stage.kind === "placing" ? "Sending…" : `Place order · ${formatINR(price.total)}`}
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            className="flex min-h-11 flex-1 items-center justify-center border border-graphite text-body text-quiet transition-colors duration-[--dur-ui] hover:border-quiet hover:text-paper"
          >
            Save &amp; share
          </button>
          <button
            type="button"
            onClick={download}
            className="flex min-h-11 flex-1 items-center justify-center border border-graphite text-body text-quiet transition-colors duration-[--dur-ui] hover:border-quiet hover:text-paper"
          >
            Download docket
          </button>
        </div>

        {stage.kind === "error" && (
          <p role="alert" className="border border-seal bg-seal/15 px-4 py-3 text-meta leading-snug text-paper">
            {stage.message}
          </p>
        )}

        {share && (
          <p className="font-mono text-micro leading-relaxed break-all text-quiet">
            Shareable link:{" "}
            <a className="text-paper underline underline-offset-2" href={share.url}>
              {share.url}
            </a>
          </p>
        )}
      </section>

      {/* Everything the docket says, spelled out. Below 1280 the docket is a
          sheet, so this is where the detail actually gets read. */}
      <Section title="Cake">
        <Row k="Shape" v={`${cap(config.shape)}, ${config.tiers} tier${config.tiers > 1 ? "s" : ""}`} />
        <Row k="Weight" v={`${config.size}`} />
        <Row k="Serves" v={`${servings.min}–${servings.max} · ${servings.basis}`} />
        <Row
          k="Layers"
          v={
            <span className="flex flex-col gap-0.5">
              {layers.map((l, i) => (
                <span key={i}>
                  {l.flavor} {l.type}
                </span>
              ))}
            </span>
          }
        />
        <Row k="Frosting" v={`${cap(config.frosting)}, ${cap(config.coverage)}, ${cap(config.finish)}`} />
        {config.hasDrip && <Row k="Drip" v="Yes" />}
        <Row
          k="Toppings"
          v={config.toppings.length
            ? config.toppings.map(t => `${cap(t.kind)} (${cap(t.placement)}, ${t.density}/5)`).join("; ")
            : "None"}
        />
        <Row k="Message" v={config.message?.trim() ? `"${config.message.trim()}"` : "None"} />
      </Section>

      <Section title="Diet and allergens">
        <Row k="Eggless" v={config.eggless ? "Yes" : "No"} />
        <Row k="Sugar-free" v={config.sugarFree ? "Yes" : "No"} />
        <Row k="Contains" v={allergens.allergens.length ? allergens.allergens.join(", ") : "No declared allergens"} />
        {allergens.egglessCaveat && <Row k="Note" v={allergens.egglessCaveat} />}
      </Section>

      <Section title="Handling">
        <Row k="Storage" v={handling.storage} />
        <Row k="Serve at" v={handling.serveAt} />
        <Row k="Best before" v={handling.bestBefore} />
      </Section>

      <Section title="Delivery">
        <Row k="Slot" v={slot.name} />
        <Row k="Lead time" v={`${slot.effectiveLeadHours} hours`} />
        <Row k="Window" v={slot.window} />
        <Row k="Pincode" v={config.pincode ?? "Not set"} />
        {!slot.available && slot.unavailableReason && (
          <Row k="Note" v={slot.unavailableReason} />
        )}
      </Section>

      {/* The itemised lines only. The kitchen-confirmation sentence lives on the
          ink card above, and printing it twice put two matches on the page for
          the one fact a customer is meant to read once. */}
      <Section title="Price">
        <PriceBreakdown price={price} />
      </Section>

      {DELIVERED_PHOTOS.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className={eyebrow}>Cakes we&rsquo;ve delivered</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 @lg:grid-cols-3">
            {DELIVERED_PHOTOS.map(p => (
              <figure key={p.src} className="overflow-hidden border border-rule bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.alt} className="w-full" />
                <figcaption className="px-3 py-2.5 text-meta leading-snug text-steel">
                  {p.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <p className="font-mono text-micro leading-relaxed text-steel">
        Or carry the design in the URL:{" "}
        <Link className="text-ink underline underline-offset-2" href={`/d/new?c=${encodeConfig(config)}`}>
          open this cake
        </Link>
      </p>
    </div>
  );
}

/** The moment the order lands. Reference first, at the size of the news. */
function Placed({
  reference, onDownload, slotName, leadHours,
}: {
  reference: string; onDownload: () => void; slotName: string; leadHours: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <span className={eyebrow}>Order placed</span>
      <h1 className="text-heading">
        Order{" "}
        <span className="font-mono text-[0.8em] font-medium tracking-[-0.01em]">
          {reference}
        </span>
      </h1>
      <p className="max-w-[52ch] text-body leading-relaxed text-steel">
        We have it. Someone from the kitchen calls to confirm the design and the
        slot — {`${slotName}, ${leadHours} hours`} from confirmation. Keep the
        reference; it is the only thing you need if anything is wrong.
      </p>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={onDownload} className={btn("primary", "md")}>
          Download docket
        </button>
        <Link href="/" className={btn("secondary", "md")}>
          Design another
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-rule bg-paper px-5 py-4">
      <h2 className="mb-2 font-mono text-micro tracking-[0.18em] text-brass uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-rule py-2 last:border-0">
      <span className="w-24 shrink-0 font-mono text-micro text-steel">{k}</span>
      <span className="min-w-0 flex-1 text-meta leading-snug">{v}</span>
    </div>
  );
}

function cap(s: string) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
