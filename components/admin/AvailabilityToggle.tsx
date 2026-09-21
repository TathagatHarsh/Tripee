"use client";

import { useActionState, useEffect, useRef } from "react";
import { setAvailability } from "@/app/admin/actions";
import { useToast } from "./Toast";
import { Icon } from "./icons";

/**
 * On today, or withdrawn.
 *
 * §19 asks for this to be immediately understandable and explicitly asks for it
 * *not* to be complicated: no confirmation, no dialog, one press. It is the one
 * write in the portal with no confirmation step, and that is on purpose —
 * withdrawing a filling is reversible by pressing the same control again, and
 * nothing about an existing order or design changes either way. (Which is
 * itself worth knowing and is why the toast says so: see `setAvailability`.)
 *
 * ## Why a switch and not a checkbox
 *
 * `role="switch"` with `aria-checked`, which is announced as "on"/"off" rather
 * than "checked"/"not checked". The distinction matters here: a checkbox reads
 * as "I am selecting this option", and this control reads as "this option is
 * currently being sold" — a state of the world, not a selection.
 *
 * ## Optimism, and why there is none
 *
 * The switch shows the server's value and moves when the server says it moved.
 * An optimistic flip would be smoother and would sometimes lie: a failed write
 * leaves an owner looking at a green switch on a filling the shop is out of,
 * and the toast that says otherwise is four seconds long. `pending` shows the
 * work; the value shows the truth.
 */

export function AvailabilityToggle({
  id,
  available,
  /** For the accessible name — "Dark Chocolate, available". */
  label,
  size = "md",
}: {
  id: string;
  available: boolean;
  label: string;
  size?: "sm" | "md";
}) {
  const [state, submit, pending] = useActionState(setAvailability, undefined);
  const { toast } = useToast();
  const form = useRef<HTMLFormElement>(null);

  /*
   * `state` is a fresh object per submission, so this fires once per result.
   * Guarded on undefined, which is the initial value and is not a result —
   * without the guard every one of these on a page of twenty-four toppings
   * would announce itself on mount.
   */
  useEffect(() => {
    if (state) toast(state.message, state.ok);
  }, [state, toast]);

  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "size-3.5" : "size-4.5";
  const travel = size === "sm" ? "translate-x-4" : "translate-x-5";

  return (
    <form ref={form} action={submit} className="flex items-center gap-2.5">
      <input type="hidden" name="id" value={id} />
      {/* The value being asked for, not the current one — so a double-press
          cannot ask for the same state twice and read as a no-op. */}
      <input type="hidden" name="next" value={available ? "false" : "true"} />

      <button
        type="submit"
        role="switch"
        aria-checked={available}
        disabled={pending}
        className={[
          "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border",
          "transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)]",
          track,
          available
            ? "border-a-good bg-a-good"
            : "border-a-line-strong bg-a-idle-wash",
          pending ? "cursor-wait opacity-60" : "",
        ].join(" ")}
      >
        {/* The visible label sits outside the switch, so the switch itself
            carries the whole accessible name. */}
        <span className="sr-only">
          {label} — {available ? "available, press to withdraw" : "withdrawn, press to make available"}
        </span>
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none ml-0.5 flex items-center justify-center rounded-full bg-white shadow-sm",
            "transition-transform duration-[var(--dur-ui)] ease-[var(--ease-out)]",
            knob,
            available ? travel : "translate-x-0",
          ].join(" ")}
        >
          {available && <Icon name="check" size={size === "sm" ? 9 : 11} className="text-a-good" />}
        </span>
      </button>

      {/*
        The word, next to the switch. §19 shows both a dot and a label and it is
        right to: a switch with no text beside it is a control whose meaning has
        to be inferred from which way it is pointing, which is exactly the
        ambiguity that makes people press it to find out.
      */}
      <span
        aria-hidden="true"
        className={[
          "text-a-meta font-medium whitespace-nowrap",
          available ? "text-a-good-ink" : "text-a-muted",
        ].join(" ")}
      >
        {pending ? "Saving…" : available ? "Available" : "Not available"}
      </span>
    </form>
  );
}
