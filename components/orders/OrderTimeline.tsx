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
    <ol className="flex flex-col">
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
              <StepGlyph state={step.state} seal={cancelled} />
              {!last && (
                <span
                  aria-hidden="true"
                  className={[
                    "min-h-6 w-px flex-1",
                    step.state === "done" ? "bg-ink" : "bg-rule",
                  ].join(" ")}
                />
              )}
            </span>

            <div className={`flex min-w-0 flex-col gap-1 ${last ? "pb-0" : "pb-6"}`}>
              <h3
                className={[
                  "font-mono text-body tracking-[0.04em]",
                  live ? (cancelled ? "text-seal" : "text-carbon") : "text-ink",
                  step.state === "upcoming" || step.state === "stopped" ? "text-steel" : "",
                ].join(" ")}
              >
                {step.label}
              </h3>

              {step.at ? (
                <time
                  dateTime={step.at.toISOString()}
                  className="font-mono text-micro tabular-nums text-steel"
                >
                  {formatIST(step.at)}
                </time>
              ) : (
                step.state === "done" && (
                  <span className="font-mono text-micro text-steel">
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
                <p className="max-w-[46ch] font-sans text-meta leading-relaxed text-ink">
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
