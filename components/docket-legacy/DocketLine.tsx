"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { docketAmount } from "@/lib/format";

interface Props {
  label: string;
  value: string;
  delta?: number;
}

/**
 * The ticket abbreviates because a kitchen ticket abbreviates. A screen reader
 * has no such convention and reads DELIV as five letters, so the abbreviation
 * stays on the page and the whole word goes to assistive technology. Only the
 * labels that are not already whole words get an entry — SHAPE, SIZE and the
 * rest are words already, and a second copy of the same word in the DOM buys
 * nothing.
 */
const LABEL_SPOKEN: Record<string, string | undefined> = {
  FILL: "Filling",
  FROST: "Frosting",
  COVER: "Coverage",
  TOP: "Topping",
  MSG: "Message",
  DELIV: "Delivery",
};

/**
 * A docket line used to type itself in one character at a time, on every value
 * change and on every mount — so navigating between steps re-typed all eleven
 * lines at once. What a customer saw was a panel of half-words: SHAPE ROU,
 * FROST AMERI, FINISH SMO. It did not read as a printer laying down a ticket.
 * It read as a bug, because for the ~400ms it was running the docket was
 * showing information that was not true.
 *
 * The docket is the trust surface. It has one job: be correct and be legible at
 * a glance. So the value is now simply correct from the first frame, and the
 * motion moved to the only thing motion is useful for here — pointing at which
 * line just changed, so a customer can see what their last tap actually did.
 */
export function DocketLine({ label, value, delta }: Props) {
  const reduced = useReducedMotion();
  const [changed, setChanged] = useState(false);
  const previous = useRef(value);
  const first = useRef(true);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    // No flash on the first paint: on mount every line is "new", and eleven
    // lines flashing at once is the old problem wearing a different hat.
    if (first.current) return;
    setChanged(true);
    const id = setTimeout(() => setChanged(false), 900);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    first.current = false;
  }, []);

  return (
    <div
      className={[
        "flex items-baseline gap-2 border py-[3px] font-mono text-micro leading-[1.9] tabular-nums",
        "-mx-1.5 px-1.5 transition-colors duration-[600ms]",
        changed && !reduced ? "border-brass-edge bg-brass-tint" : "border-transparent bg-transparent",
      ].join(" ")}
    >
      <span className="w-14 shrink-0 text-steel">
        {LABEL_SPOKEN[label] ? (
          <>
            <span aria-hidden="true">{label}</span>
            <span className="sr-only">{LABEL_SPOKEN[label]}</span>
          </>
        ) : (
          label
        )}
      </span>
      {/* min-w-0 + break-words: even rem-locked at 20rem, "WHITE CHOCOLATE
          GANACHE" has to wrap. It used to be shrink-0 whitespace-pre, which
          gave the whole docket a horizontal scrollbar. */}
      <span className="min-w-0 break-words">{value}</span>
      <span aria-hidden className="min-w-3 grow docket-leader self-stretch" />
      <span className="shrink-0 text-right text-steel">
        {delta === undefined ? "" : delta === 0 ? "—" : `+${docketAmount(delta).slice(1)}`}
      </span>
    </div>
  );
}
