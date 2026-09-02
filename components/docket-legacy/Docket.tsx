"use client";

import { useMemo } from "react";
import type { CakeConfig } from "@/lib/schema";
import { buildDocket } from "@/lib/docket";
import { allergenLine } from "@/lib/allergens";
import { deriveHandling, servingsLabel } from "@/lib/servings";
import { DocketLine } from "./DocketLine";
import { PriceBreakdown } from "./PriceBreakdown";

interface Props {
  config: CakeConfig;
  /** Set once the order is placed — the ticket gets stamped. */
  stamped?: string | null;
  /** Server-verified reference, when there is one. */
  reference?: string;
  className?: string;
  /**
   * Drop the docket's own header and landmark, for the mobile sheet — which
   * supplies both, and would otherwise nest a second complementary region with
   * the same name inside the dialog.
   */
  chromeless?: boolean;
}

/**
 * Real bakeries write orders on carbon-copy dockets: monospace, cramped,
 * abbreviated, stamped when confirmed. That artifact happens to be exactly the
 * trust surface this needs, so it is the interface rather than a summary panel.
 *
 * The identity is kept exactly. What changed is that the three blocks a
 * customer actually re-reads — the total, the portions, the allergens — used to
 * be four undifferentiated paragraphs of 11px mono at the bottom of a scroll
 * container. They are labelled blocks now, in the order they get asked about,
 * and the total sits under the one solid rule on the ticket.
 */
export function Docket({ config, stamped, reference, className, chromeless }: Props) {
  const d = useMemo(() => buildDocket(config, { ref: reference }), [config, reference]);
  const handling = deriveHandling(config);

  const Frame = chromeless ? "div" : "aside";

  return (
    <Frame
      className={`relative flex flex-col bg-paper ${chromeless ? "" : "shadow-sheet"} ${className ?? ""}`}
      {...(chromeless ? {} : { "aria-label": "Order docket" })}
    >
      {!chromeless && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-dashed border-rule px-[18px] pt-4 pb-3.5">
          <span className="font-mono text-micro font-medium tracking-[0.14em] whitespace-nowrap">
            ORDER DOCKET
          </span>
          <span className="font-mono text-micro font-medium tracking-[0.14em] whitespace-nowrap text-brass">
            #{d.ref}
          </span>
        </div>
      )}

      {/* A scrollable region has to be reachable by keyboard, or the docket is
          unreadable without a mouse. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-3.5 pb-5"
        tabIndex={0}
        role="region"
        aria-label="Order breakdown"
      >
        {d.rows.map((r) => (
          <DocketLine key={r.key} label={r.label} value={r.value} delta={r.delta} />
        ))}

        <Rule />

        <PriceBreakdown price={d.price} dense />

        <Rule />

        {/* Portions, timing, zone — the three questions asked after the price. */}
        <DocketLine label="SERVES" value={servingsLabel(config).toUpperCase()} />
        <DocketLine label="LEAD" value={d.delivery.leadTime.toUpperCase()} />
        <DocketLine label="SLOT" value={d.delivery.slot.toUpperCase()} />

        <Rule />

        {/*
          These are the safety-critical lines. They were set in 9.5px tracked-out
          uppercase monospace — the least legible combination available — on the
          one block of text nobody can afford to misread. Monospace stays,
          because the docket is a ticket. The 9.5px did not.
        */}
        <Block label="ALLERGENS">{allergenLine(config)}</Block>
        {d.diet.caveat && <Block label="NOTE">{d.diet.caveat}</Block>}
        <Block label="HANDLING">
          {handling.storage} · best before {handling.bestBefore}
        </Block>

        {d.fssai && <Block label="FSSAI">Lic. No. {d.fssai}</Block>}

        <p className="mt-5 border-t border-dashed border-rule pt-3 font-mono text-micro leading-[1.9] tracking-[0.06em] text-steel">
          THE TICKET OUR KITCHEN
          <br />
          WORKS FROM.
        </p>
      </div>

      {stamped && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="stamp px-4 py-2 font-mono text-body font-medium uppercase">
            {stamped}
          </div>
        </div>
      )}
    </Frame>
  );
}

function Rule() {
  return <hr className="my-3.5 border-0 border-t border-dashed border-rule" />;
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="mt-3 font-mono text-micro leading-[1.85] text-steel first:mt-0">
      {label}
      <br />
      <span className="text-ink">{children}</span>
    </p>
  );
}
