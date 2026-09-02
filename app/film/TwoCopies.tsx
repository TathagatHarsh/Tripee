"use client";

import { useRef, useState } from "react";

import type { TicketLine } from "./cake";

/**
 * Two copies. One truth.
 *
 * The same ticket, rendered twice: the top copy the customer keeps, and the
 * carbon the kitchen works from. They are not two designs of one document —
 * they are one document that exists in two places, which is the entire brand in
 * one section.
 *
 * It sells nothing. There is no button here and there should never be one: the
 * moment this section asks for something it stops being a demonstration and
 * starts being a pitch, and the point it is making is that the bakery has
 * already written down exactly what you said.
 */
export function TwoCopies({ lines, ticketNo }: { lines: TicketLine[]; ticketNo: string }) {
  /* Where the tear sits, as a percentage. Dragging it wipes one sheet over the
     other — a wipe, because paper slides and paper does not dissolve. */
  const [split, setSplit] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setSplit(Math.min(88, Math.max(12, ((clientX - box.left) / box.width) * 100)));
  };

  return (
    <section className="film border-t border-ink-15 bg-paper-3">
      <div className="mx-auto max-w-[1400px] px-[24px] py-[96px] md:px-[48px]">
        <h2 className="text-[length:var(--mono-xl)] leading-[var(--leading-mono-xl)] tracking-[var(--tracking-mono-xl)]">
          Two copies. One truth.
        </h2>
        <p className="mt-[16px] text-[length:var(--prose-base)] text-ink-60">
          You keep the top copy. The kitchen works off the carbon. Nobody
          retypes anything, which is why nobody mishears anything.
        </p>

        <div
          ref={frame}
          className="relative mt-[48px] flex select-none flex-col overflow-hidden md:flex-row"
          style={{ ["--split" as string]: `${split}%` }}
          onPointerMove={e => dragging.current && moveTo(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerLeave={() => (dragging.current = false)}
        >
          {/* TOP COPY — ink on paper. */}
          <div className="paper-edge w-full shrink-0 bg-paper p-[32px] md:w-[var(--split)]">
            <Sheet lines={lines} ticketNo={ticketNo} label="Top copy — yours" />
          </div>

          {/* Perforation, use 2 of 2 on this page: the tear line. It is also the
              handle, because on a document the tear line is where your thumb
              already is. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Tear line — drag to compare the two copies"
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            className="film-perf-tear z-[2]"
            onPointerDown={e => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onKeyDown={e => {
              if (e.key === "ArrowLeft") setSplit(s => Math.max(12, s - 4));
              if (e.key === "ArrowRight") setSplit(s => Math.min(88, s + 4));
            }}
          />

          {/* CARBON — the kitchen's version. Violet-blue on manila, tracked one
              hundredth wider and offset half a pixel down and right, which is
              what a second impression through carbon paper actually looks like. */}
          <div className="paper-edge min-w-0 grow overflow-hidden bg-paper-2 p-[32px]">
            <div
              className="text-carbon-ghost"
              style={{ letterSpacing: "0.01em", transform: "translate(0.5px, 0.5px)" }}
            >
              <Sheet lines={lines} ticketNo={ticketNo} label="Carbon — kitchen" carbon />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sheet({
  lines,
  ticketNo,
  label,
  carbon = false,
}: {
  lines: TicketLine[];
  ticketNo: string;
  label: string;
  carbon?: boolean;
}) {
  return (
    <div className="min-w-0 md:min-w-[280px]">
      <div className="flex items-baseline justify-between text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] uppercase">
        <span>{label}</span>
        <span>No. {ticketNo}</span>
      </div>
      <div className={`mt-[8px] h-px w-full ${carbon ? "bg-carbon-ghost" : "bg-ink"}`} />
      <div className="mt-[16px]">
        {lines.map(l => (
          <div key={l.slug} className="film-ticket-line" data-printed="true">
            <span className={carbon ? "" : "film-label"}>{l.label}</span>
            <span className="film-leader" aria-hidden />
            <span className={carbon ? "text-right" : "film-value"}>
              {l.value}
              {l.appended ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
