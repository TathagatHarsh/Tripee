"use client";

import { useActionState, useEffect } from "react";
import { setCakeAvailability } from "@/app/admin/cakes/actions";
import { useToast } from "./Toast";
import { StatusBadge } from "./ui";

/**
 * On the shelf, or off it, as one control.
 *
 * A button rather than a checkbox: the state is a word and the action is a
 * sentence, and a bare tickbox in a table row gives neither. The label says
 * where the cake *is*, the title says what pressing it does — so the badge
 * reads as a status when you are scanning and as a control when you reach for
 * it.
 *
 * Optimism is deliberately absent. The row shows what the server last said, and
 * the toast is what says a write happened; a switch that flips instantly and
 * silently reverts on failure is the case §24 exists to prevent, because a
 * failed save then looks exactly like a switch nobody pressed.
 *
 * Nothing here is the gate. `setCakeAvailability` calls `requireAdmin()` for
 * itself — this component ships to the browser, and anything it appears to
 * enforce is a suggestion.
 */
export function CakeAvailability({
  id,
  name,
  available,
}: {
  id: string;
  name: string;
  available: boolean;
}) {
  const [state, act, pending] = useActionState(setCakeAvailability, undefined);
  const { toast } = useToast();

  /* Announce once per result. The effect, not the render — see the note in
     components/admin/CakeForm on why the comparison sets state and nothing
     else. */
  useEffect(() => {
    if (state) toast(state.message, state.ok);
  }, [state, toast]);

  return (
    <form action={act} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="next" value={String(!available)} />
      <button
        type="submit"
        disabled={pending}
        title={available ? `Take ${name} off the shelf` : `Put ${name} back on the shelf`}
        className="rounded-a-sm transition-opacity disabled:opacity-60"
      >
        <StatusBadge
          label={pending ? "Saving…" : available ? "On the shelf" : "Off the shelf"}
          tone={available ? "good" : "plain"}
        />
      </button>
    </form>
  );
}
