"use client";

import { useActionState } from "react";
import type { OrderStatus } from "@prisma/client";
import { advanceOrderStatus, type ActionResult } from "../../actions";
import { ACTION_LABEL } from "@/lib/orders";
import { btn } from "@/lib/ui";

/**
 * The moves this order can make, as buttons.
 *
 * Only the legal ones are drawn — `next` is lib/orders' NEXT_STATUS for the
 * status the server just read — and the server checks again anyway, because a
 * page left open in an office tab is a page whose buttons describe a state the
 * order may have left half an hour ago.
 *
 * One form with several submit buttons rather than a form each: a browser sends
 * only the clicked submit button's name and value, so `to` arrives correct
 * without any JavaScript deciding it, and one `useActionState` then covers the
 * whole group. `pending` disables every button while a move is in flight, which
 * is what stops the second click of an impatient double-click from posting a
 * second transition.
 */
export function StatusActions({
  orderRef,
  next,
}: {
  orderRef: string;
  next: OrderStatus[];
}) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    advanceOrderStatus,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="ref" value={orderRef} />

      <div className="flex flex-wrap items-center gap-2">
        {next.map((s) => (
          <button
            key={s}
            type="submit"
            name="to"
            value={s}
            disabled={pending}
            className={btn(s === "cancelled" ? "quiet" : "primary", "md")}
          >
            {ACTION_LABEL[s]}
          </button>
        ))}
      </div>

      {result && (
        <p
          role="status"
          className={`font-mono text-micro ${result.ok ? "text-carbon" : "text-seal"}`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
