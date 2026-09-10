import { formatIST } from "@/lib/format";
import type { ProgressStep } from "@/lib/orders";
import { StepGlyph } from "./OrderStatusBadge";

/**
 * The tracker: five marks and the road between them.
 *
 * ## One list, two layouts, no duplicated content
 *
 * On a phone this is a row of joined marks with no labels, and on a tablet
 * upwards the labels and their timestamps sit underneath. The labels are not
 * *removed* below `sm` — they are `sr-only`, so a screen reader reads the same
 * five named steps at every width, and the compact rendering is a visual
 * decision rather than a smaller amount of information. Rendering two trackers
 * and hiding one would say each step's name twice to anybody listening.
 *
 * Five labels do not fit across 375px at this system's 12px floor, and shrinking
 * the type below that floor to make them fit is the thing §1.2 of the design
 * document forbids. What replaces them on a phone is the count above the row and
 * the vertical timeline directly beneath, which carries every label and every
 * timestamp in full — so nothing is only available on a wide screen.
 *
 * `<ol>`, because these are ordered and a screen reader should say so.
 */
export function OrderProgress({ steps }: { steps: ProgressStep[] }) {
  const currentIndex = steps.findIndex((s) => s.state === "current");
  /* Cancelled orders carry a sixth node, so "of" counts the road rather than
     the list — see buildProgress. */
  const road = steps.filter((s) => s.status !== "cancelled");
  const total = road.length;
  /* A delivered order has no current step — every node is a tick — so the
     count falls back to how many are done, which is all of them. A cancelled
     one counts the steps it did reach. */
  const position =
    currentIndex >= 0
      ? Math.min(currentIndex + 1, total)
      : road.filter((s) => s.state === "done").length;

  return (
    <div className="flex flex-col gap-3">
      {/* aria-hidden: the same fact is in the heading above and in the marks
          below, and a third reading of it is noise. */}
      <p aria-hidden="true" className="font-mono text-micro tracking-[0.14em] text-steel uppercase sm:hidden">
        Step {position} of {total}
      </p>

      <ol className="flex items-start">
        {steps.map((step, i) => {
          const cancelled = step.status === "cancelled";
          const prev = steps[i - 1];

          return (
            <li key={step.status} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="flex w-full items-center">
                <Rail on={i > 0 && (prev?.state === "done" || cancelled)} hidden={i === 0} />
                <StepGlyph state={step.state} seal={cancelled} />
                <Rail on={step.state === "done"} hidden={i === steps.length - 1} />
              </span>

              <span
                className={[
                  "sr-only text-center sm:not-sr-only sm:block",
                  "font-mono text-micro leading-[1.35] tracking-[0.06em] uppercase",
                  step.state === "current"
                    ? cancelled ? "text-seal" : "text-carbon"
                    : step.state === "done" ? "text-ink" : "text-steel",
                ].join(" ")}
              >
                {step.label}
              </span>

              {/* Only where something was actually recorded. A step with no row
                  behind it prints nothing rather than a plausible time. */}
              {step.at && (
                <time
                  dateTime={step.at.toISOString()}
                  className="hidden text-center font-mono text-micro tabular-nums text-steel sm:block"
                >
                  {formatIST(step.at)}
                </time>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Half the road between two marks. Ink once it has been travelled. */
function Rail({ on, hidden }: { on: boolean; hidden: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "h-px flex-1",
        hidden ? "bg-transparent" : on ? "bg-ink" : "bg-rule",
      ].join(" ")}
    />
  );
}
