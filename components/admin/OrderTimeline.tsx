import type { OrderStatus } from "@prisma/client";
import type { ProgressStep, TimelineEntry } from "@/lib/orders";
import { formatIST } from "@/lib/format";
import { aEyebrow } from "./ui";
import { Icon } from "./icons";

/**
 * Where an order is, and how it got there.
 *
 * §8 asks for a visual progress timeline with the current state highlighted,
 * and separately for a timeline of every status change with timestamps. Those
 * are two components because they answer two questions — "where is it now" is
 * read at a glance, "when was it confirmed" is read carefully — but they are
 * driven by the same two functions in lib/orders, which is what keeps them from
 * disagreeing.
 *
 * **Nothing here is inferred and nothing is invented.** Both components render
 * exactly what `buildProgress` and `buildTimeline` return, and both of those
 * are explicit that an order confirmed before OrderEvent existed shows no
 * confirmation row — see the long note on `buildTimeline`. A tracker that
 * guessed the missing timestamps would look complete and be fiction. Where a
 * step happened but was never recorded, the dot is filled and the time is
 * absent, and that is the honest rendering of it.
 *
 * The state machine is untouched. §8 asks for that explicitly and it is
 * satisfied by these being pure display: `lib/orders`' NEXT_STATUS decides what
 * is legal, `lib/orderTransition` writes it, and this draws the result.
 */

/* ══════════════════════════════════════════════════════ the tracker */

const DOT: Record<ProgressStep["state"], string> = {
  done: "border-a-good bg-a-good text-white",
  current: "border-a-accent bg-a-accent text-white",
  upcoming: "border-a-line-strong bg-a-surface text-a-ghost",
  /* A step a cancelled order will now never reach. Dashed, not red — the
     cancellation is the red thing, and this is merely a road not taken. */
  stopped: "border-dashed border-a-line-strong bg-a-idle-wash text-a-ghost",
};

const RAIL: Record<ProgressStep["state"], string> = {
  done: "bg-a-good",
  current: "bg-a-good",
  upcoming: "bg-a-line",
  stopped: "bg-a-line",
};

export function OrderProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    /*
     * A list, and an ordered one. This is a sequence and a screen reader should
     * say so; `role="list"` survives the `list-none` that Safari otherwise
     * applies when a list has no markers.
     */
    <ol role="list" className="flex flex-col gap-0 sm:flex-row">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const cancelled = step.status === "cancelled";

        return (
          <li
            key={step.status}
            className="relative flex flex-1 gap-3 pb-5 last:pb-0 sm:flex-col sm:gap-2 sm:pb-0"
          >
            {/* ── the rail ───────────────────────────────────────────────
                Vertical on a phone, horizontal above it. Drawn behind the dot
                rather than between dots, so the two do not have to agree about
                a gap that changes with the font size. */}
            {!last && (
              <span
                aria-hidden="true"
                className={[
                  "absolute",
                  /* phone: down the left, from under this dot to the next */
                  "left-[0.6875rem] top-6 h-[calc(100%-1.5rem)] w-0.5",
                  /* desktop: across, from this dot to the next */
                  "sm:left-6 sm:top-[0.6875rem] sm:h-0.5 sm:w-[calc(100%-1.5rem)]",
                  RAIL[step.state],
                ].join(" ")}
              />
            )}

            <span
              className={[
                "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                DOT[step.state],
              ].join(" ")}
            >
              {step.state === "done" && <Icon name="check" size={12} />}
              {step.state === "current" && !cancelled && (
                /* A filled ring rather than a pulsing dot: an operations page
                   that animates is an operations page somebody turns away from. */
                <span aria-hidden="true" className="size-2 rounded-full bg-white" />
              )}
              {cancelled && <Icon name="close" size={12} />}
            </span>

            <span className="flex min-w-0 flex-col sm:pr-3">
              <span
                className={[
                  "font-a-sans text-a-small font-semibold leading-snug",
                  step.state === "current" ? "text-a-ink"
                  : step.state === "done" ? "text-a-ink"
                  : "text-a-faint",
                ].join(" ")}
              >
                {step.label}
              </span>

              {/*
                The timestamp, or a word about why there isn't one. The
                distinction between "this has not happened" and "this happened
                and nobody wrote it down" is the one thing a timeline must not
                blur, so an unrecorded step that is plainly in the past says so.
              */}
              <span className="mt-0.5 font-a-mono text-a-meta leading-snug text-a-muted">
                {step.at
                  ? formatIST(step.at)
                  : step.state === "done"
                  ? "Not recorded"
                  : step.state === "current"
                  ? "—"
                  : ""}
              </span>

              {step.state === "current" && (
                <span className="mt-1 max-w-[16rem] text-a-meta leading-snug text-a-muted">
                  {step.note}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ══════════════════════════════════════════════════════ the history */

/**
 * Every recorded move, oldest first, with who made it.
 *
 * §8's "show every status change with timestamp". The actor is the part that
 * only this can show: `Order.status` knows where a docket is and only
 * `OrderEvent` knows who put it there. Null when the account has since been
 * removed — the FK's SET NULL allows that on purpose, and "Someone" is the
 * honest rendering rather than dropping the row.
 */
export function OrderHistory({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol role="list" className="flex flex-col">
      {entries.map((e, i) => (
        <li
          key={`${e.label}-${e.at.getTime()}-${i}`}
          className="relative flex gap-3 pb-4 last:pb-0"
        >
          {i < entries.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[0.4375rem] top-4 h-[calc(100%-1rem)] w-px bg-a-line"
            />
          )}
          <span
            aria-hidden="true"
            className="relative z-10 mt-1.5 size-2 shrink-0 rounded-full bg-a-line-strong ring-4 ring-a-surface"
          />
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <span className="font-a-sans text-a-small font-medium text-a-ink">
              {e.label}
              {e.actorName && (
                <span className="font-normal text-a-muted"> · {e.actorName}</span>
              )}
              {!e.actorName && i > 0 && (
                <span className="font-normal text-a-faint"> · staff member since removed</span>
              )}
            </span>
            <span className="font-a-mono text-a-meta text-a-muted">{formatIST(e.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A one-line summary of where an order is, for a list row.
 *
 * Exported from here rather than duplicated in the orders table, so that the
 * words next to a docket in a list are the same words on its own page.
 */
export function DueLabel({
  dueAt,
  now,
  status,
}: {
  dueAt: Date;
  now: Date;
  status: OrderStatus;
}) {
  /*
   * A closed order is never late. `delivered` and `cancelled` have no window
   * left to miss, and marking a cake that arrived last Tuesday as "3 days late"
   * because it was delivered after its quoted slot is a table full of red that
   * nobody can act on.
   */
  const open = status !== "delivered" && status !== "cancelled";
  const late = open && dueAt < now;

  return (
    <span className="flex flex-col">
      <span
        className={[
          "font-a-mono text-a-small tabular-nums",
          late ? "font-semibold text-a-bad-ink" : "text-a-ink",
        ].join(" ")}
      >
        {formatIST(dueAt)}
      </span>
      {late && (
        <span className={`${aEyebrow} !text-a-bad-ink`}>Past its window</span>
      )}
    </span>
  );
}
