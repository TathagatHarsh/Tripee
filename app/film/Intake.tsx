"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { resolveSlot, zoneForPincode } from "@/lib/delivery";
import { TICKET_NO } from "./cake";
import { earliestDate, formatDay, parseWhen } from "./when";

/**
 * The section the whole film exists to deliver you to.
 *
 * Three questions, and every one of them is checked at the moment it is
 * answered rather than at a checkout screen four steps later. A constraint that
 * only surfaces at the end is a constraint the customer discovers after they
 * have already decided; the whole argument of this product is that the ticket
 * tells you the truth from the first tap, and a lead time you cannot make is
 * part of the truth.
 *
 * Nothing here opens a modal. A constraint prints onto the ticket as another
 * line with its fix attached — a modal is a thing that interrupts you, and a
 * line on a docket is a thing you read.
 */

interface Constraint {
  line: string;
  fix: { label: string; apply: () => void };
}

export function Intake() {
  const [occasion, setOccasion] = useState("");
  const [people, setPeople] = useState("");
  const [when, setWhen] = useState("");
  const [pincode, setPincode] = useState("");
  const [pickup, setPickup] = useState(false);

  const now = useMemo(() => new Date(), []);
  const resolved = parseWhen(when, now);

  const slot = pickup ? "pickup" : "standard";
  const lead = resolveSlot(slot, pincode.length === 6 ? pincode : undefined);
  const earliest = earliestDate(now, lead.effectiveLeadHours);

  const constraints: Constraint[] = [];

  /* The pincode, against the zones in lib/delivery. */
  if (pincode.length === 6 && !zoneForPincode(pincode)) {
    constraints.push({
      line: `WE DON'T RIDE TO ${pincode} YET`,
      fix: { label: "Collect it instead", apply: () => setPickup(true) },
    });
  } else if (pincode.length === 6 && !lead.available) {
    constraints.push({
      line: (lead.unavailableReason ?? "").toUpperCase(),
      fix: { label: "Collect it instead", apply: () => setPickup(true) },
    });
  }

  /* The day, against the lead time that zone actually carries. */
  if (resolved && resolved.date < earliest) {
    constraints.push({
      line: `${resolved.label} IS INSIDE ${lead.effectiveLeadHours} HOURS`,
      fix: {
        label: `Move it to ${formatDay(earliest)}`,
        apply: () => setWhen(formatDay(earliest)),
      },
    });
  }

  const href = {
    pathname: "/build",
    query: {
      ...(occasion ? { occasion } : {}),
      ...(people ? { people } : {}),
      ...(resolved ? { when: resolved.date.toISOString().slice(0, 10) } : {}),
      ...(pincode.length === 6 ? { pincode } : {}),
      ...(pickup ? { delivery: "pickup" } : {}),
    },
  };

  const rows: [string, string | null][] = [
    ["OCCASION", occasion.trim() ? occasion.trim().toUpperCase() : null],
    ["EATING", people.trim() ? `${people.trim()} PEOPLE` : null],
    ["GOES OUT", resolved ? resolved.label : null],
    [
      pickup ? "COLLECT" : "DELIVER TO",
      pickup ? "JUBILEE HILLS COUNTER" : pincode.length === 6 ? pincode : null,
    ],
  ];

  const answered = rows.some(([, v]) => v !== null);

  return (
    /* scroll-mt clears the sticky letterhead: without it the skip link lands the
         intake's top edge and its ticket header underneath the masthead rule. */
    <section id="intake" className="film min-h-dvh scroll-mt-[88px] border-t border-ink-15">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-[32px] px-[24px] py-[64px] md:grid-cols-12 md:gap-[96px] md:px-[48px] md:py-[96px]">
        {/* Seven columns of paper. */}
        <div className="md:col-span-7">
          <div className="film-perf-top" aria-hidden />

          <div className="flex items-baseline justify-between pt-[16px] text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
            <span>Makemycake · Jubilee Hills</span>
            <span>Ticket No. {TICKET_NO}</span>
          </div>
          <div className="mt-[8px] h-px w-full bg-ink" />

          <div className="mt-[12px] text-[length:var(--mono-sm)] tracking-[var(--tracking-mono-sm)] uppercase">
            {answered ? (
              <span className="text-ink-60">Three answers and the kitchen can start.</span>
            ) : (
              <>
                Nothing on it yet. <span className="film-caret" aria-hidden />
              </>
            )}
          </div>

          <div className="mt-[48px] grid gap-[32px]">
            <Field
              label="What is it for"
              placeholder="BIRTHDAY"
              value={occasion}
              onChange={setOccasion}
            />
            <Field
              label="How many people are eating"
              placeholder="14"
              value={people}
              inputMode="numeric"
              onChange={v => setPeople(v.replace(/\D/g, "").slice(0, 3))}
            />
            <div className="grid gap-[32px] sm:grid-cols-2">
              <Field
                label="When does it go out"
                placeholder="SATURDAY"
                value={when}
                onChange={setWhen}
              />
              <Field
                label="Where does it go"
                placeholder="500033"
                value={pincode}
                inputMode="numeric"
                onChange={v => {
                  setPincode(v.replace(/\D/g, "").slice(0, 6));
                  setPickup(false);
                }}
              />
            </div>
          </div>

          <div className="mt-[48px] flex flex-wrap items-center gap-[24px]">
            <Link href={href} className="film-button">
              Take this to the builder
            </Link>
            <span className="text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
              No payment now · We call to confirm
            </span>
          </div>
        </div>

        {/* Five columns holding the cut frame, and the ticket printing under it. */}
        <div className="md:col-span-5">
          <CutFrame />

          <div className="mt-[32px]">
            {rows.map(([label, value]) => (
              <div key={label} className="film-ticket-line" data-printed={value !== null}>
                <span className="film-print film-label">{label}</span>
                <span className="film-leader" aria-hidden />
                <span className="film-print film-value">{value ?? ""}</span>
              </div>
            ))}

            {constraints.map(c => (
              <div key={c.line} className="mt-[16px] border-t border-ink-15 pt-[12px]">
                <p className="text-[length:var(--mono-sm)] tracking-[var(--tracking-mono-sm)] text-stamp uppercase">
                  {c.line}
                </p>
                <button type="button" onClick={c.fix.apply} className="film-link mt-[8px]">
                  {c.fix.label}
                </button>
              </div>
            ))}

            {resolved && !constraints.length && (
              <p className="mt-[16px] text-[length:var(--prose-sm)] text-ink-60">
                {resolved.label} is {lead.effectiveLeadHours} hours out or better, so nothing gets
                filled while it is warm. That is the whole reason we ask for the day.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric";
}) {
  return (
    <label className="block">
      <span className="block text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
        {label}
      </span>
      <input
        className="film-field mt-[8px]"
        placeholder={placeholder}
        value={value}
        inputMode={inputMode}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * The last frame of the film, held still. It is the same cut face the reader
 * just scrolled to, which is what makes the intake read as the bottom of the
 * film rather than as a form bolted underneath one.
 */
function CutFrame() {
  const [missing, setMissing] = useState(false);

  return (
    <div className="film-specimen aspect-video w-full">
      {!missing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/film/cut.webp"
          alt="The cake cut open: three Belgian Chocolate layers, two bands of Cherry Compote, the Swiss Meringue shell a real thickness at the cut"
          className="film-poster"
          onError={() => setMissing(true)}
        />
      )}
    </div>
  );
}
