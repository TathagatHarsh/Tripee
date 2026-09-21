import { formatIST } from "@/lib/format";
import type { ProgressStep } from "@/lib/orders";
import { StepGlyph } from "./OrderStatusBadge";

/**
 * The history, in full, down the page.
 *
 * The same array the tracker above it is drawn from — `buildProgress` — so the
 * two cannot disagree about where the order is. What this adds is everything the
 * tracker has no room for: the note under each state, and the timestamp of every
 * move that was actually recorded.
 *
 * ## Nothing here is invented
 *
 * A step with no `at` prints no time. That covers two different silences and
 * says so differently: a step that has not happened yet is simply blank, while a
 * step the order has plainly passed through with no OrderEvent row behind it
 * says the time was not recorded. Every order placed before that table existed
 * is in the second case, and prisma/schema.prisma is explicit about why it stays
 * that way — a fabricated confirmation time would make this a story rather than
 * a record, and this page is the one the customer is asked to trust.
 */
export function OrderTimeline({ steps }: { steps: ProgressStep[] }) {
  return (
    /* `s-track` staggers each row in by 60ms as the page paints; see
       globals.css. Motivated by the content: this is a history, and a history
       reads down. Collapses to static under prefers-reduced-motion. */
    <ol className="s-track flex flex-col">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const cancelled = step.status === "cancelled";
        const live = step.state === "current";

        return (
          <li key={step.status} className="flex gap-3.5 sm:gap-4">
            {/* The mark, and the thread hanging under it. `min-h` on the thread
                rather than a fixed height, so a row with a note grows and the
                line grows with it. */}
            <span className="flex flex-col items-center gap-1.5">
              {/* The halo only exists on the step the order is actually on, and
                  only when that step is not the cancelled one: a pulse on "we
                  stopped" would read as activity. `live` comes from
                  buildProgress, so it is the order's real state. */}
              <span className={live && !cancelled ? "s-live-mark inline-flex" : "inline-flex"}>
                <StepGlyph state={step.state} seal={cancelled} />
              </span>
              {!last && (
                <span
                  aria-hidden="true"
                  className={[
                    "min-h-6 w-0.5 flex-1 rounded-full",
                    step.state === "done" ? "bg-s-done" : "bg-s-line",
                  ].join(" ")}
                />
              )}
            </span>

            <div className={`flex min-w-0 flex-col gap-1 ${last ? "pb-0" : "pb-6"}`}>
              <h3
                className={[
                  "text-[0.9375rem] font-medium",
                  live ? (cancelled ? "text-s-stop" : "text-s-live") : "text-s-cocoa",
                  step.state === "upcoming" || step.state === "stopped" ? "text-s-bark" : "",
                ].join(" ")}
              >
                {step.label}
              </h3>

              {step.at ? (
                <time
                  dateTime={step.at.toISOString()}
                  className="font-mono text-[0.6875rem] tabular-nums text-s-bark"
                >
                  {formatIST(step.at)}
                </time>
              ) : (
                step.state === "done" && (
                  <span className="font-mono text-[0.6875rem] text-s-bark">
                    Time not recorded
                  </span>
                )
              )}

              {/*
                Only under the live step. The sentence explains what is happening
                *now* — printing all six would put five paragraphs of a process
                nobody asked about between a customer and the one line they came
                for, and a step that is done and behind you is fully described by
                its name and its time.
              */}
              {live && (
                <p className="max-w-[46ch] text-[0.875rem] leading-relaxed text-s-bark">
                  {step.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
