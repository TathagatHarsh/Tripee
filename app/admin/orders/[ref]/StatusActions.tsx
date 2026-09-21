"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { advanceOrderStatus, type ActionResult } from "../../actions";
import { ACTION_LABEL, STATUS_LABEL } from "@/lib/orders";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/admin/Toast";
import { aBtn } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

/**
 * The moves this order can make, as buttons.
 *
 * Only the legal ones are drawn — `next` is lib/orders' NEXT_STATUS for the
 * status the server just read — and the server checks again anyway, because a
 * page left open in an office tab is a page whose buttons describe a state the
 * order may have left half an hour ago. §8's "only display valid actions for
 * the current state" is satisfied by the list; the correctness of it is
 * guaranteed by the recheck rather than by the list.
 *
 * One form with several submit buttons rather than a form each: a browser sends
 * only the clicked submit button's name and value, so `to` arrives correct
 * without any JavaScript deciding it, and one `useActionState` then covers the
 * whole group. `pending` disables every button while a move is in flight, which
 * is what stops the second click of an impatient double-click from posting a
 * second transition.
 *
 * ## Cancel is the one that asks
 *
 * Every other move here goes forward and is recoverable by going forward again.
 * Cancelling is terminal — lib/orders' NEXT_STATUS gives `cancelled` no
 * outgoing edges at all, so there is no "reopen" and the only fix is a new
 * order — which puts it squarely in §26's list. The dialog says that out loud
 * rather than asking "are you sure?".
 */
export function StatusActions({
  orderRef,
  status,
  next,
}: {
  orderRef: string;
  status: OrderStatus;
  next: OrderStatus[];
}) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    advanceOrderStatus,
    undefined,
  );
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);

  const forward = next.filter((s) => s !== "cancelled");
  const cancellable = next.includes("cancelled");

  return (
    <>
      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="ref" value={orderRef} />
        <input type="hidden" name="reason" value={cancellationReason} />

        <div className="flex flex-wrap items-center gap-2">
          {forward.map((s, i) => (
            <button
              key={s}
              type="submit"
              name="to"
              value={s}
              disabled={pending}
              /*
               * The first forward move is the primary action and the rest are
               * secondary. In practice `forward` has exactly one entry at every
               * state — the happy path is linear — so this is provision for a
               * state machine that gains a branch, not a live case.
               */
              className={aBtn(i === 0 ? "primary" : "secondary", "md")}
            >
              {pending ? "Working…" : ACTION_LABEL[s]}
              {!pending && i === 0 && <Icon name="arrowRight" size={15} />}
            </button>
          ))}

          {cancellable && (
            <>
              {/* The control somebody presses: a plain button that opens the
                  dialog rather than a submit that acts. */}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={pending}
                className={aBtn("quiet", "md", "text-a-bad-ink hover:bg-a-bad-wash")}
              >
                Cancel order
              </button>

              {/*
                The real submit, and the reason it exists rather than a hidden
                input: `to` has to arrive from an actual submit button, because
                the other buttons in this form each carry their own value and a
                single hidden field would have to be mutated to match whichever
                was pressed. `requestSubmit(this)` from the dialog submits as
                though it were clicked, so the value is never assembled in
                JavaScript.

                `hidden` rather than `sr-only`: it must not be reachable by tab
                or by a screen reader, since the visible button above is the one
                that represents this action.
              */}
              <button
                ref={cancelRef}
                type="submit"
                name="to"
                value="cancelled"
                hidden
                tabIndex={-1}
                aria-hidden="true"
              />
            </>
          )}
        </div>

        {/*
          The result is toasted and also printed here. Both, because a toast is
          four seconds long and the interesting failure — "that move is no
          longer available, this order has already changed" — is one somebody
          needs to still be able to read while they work out what happened.
        */}
        {result && !result.ok && (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-a border border-a-bad-line bg-a-bad-wash px-3 py-2 text-a-small font-medium leading-snug text-a-bad-ink"
          >
            <Icon name="alert" size={15} className="mt-px shrink-0" />
            {result.message}
          </p>
        )}
      </form>

      <ConfirmDialog
        open={confirming}
        title={`Cancel ${orderRef}?`}
        body={
          <>
            <span className="block">
              This order is {STATUS_LABEL[status].toLowerCase()}. Cancelling is final —
              a cancelled order does not reopen, so putting it back means taking a
              new one.
            </span>
            <span className="mt-2 block text-a-small">
              Nothing is charged against a cancelled order, and the kitchen board
              drops it from the day.
            </span>
            <label className="mt-4 flex flex-col gap-1 text-a-small">
              <span className="font-medium">Reason</span>
              <textarea
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
                maxLength={500}
                rows={3}
                className="rounded-a border border-a-line bg-a-surface px-3 py-2"
                placeholder="Customer request, duplicate order, unavailable date…"
              />
            </label>
          </>
        }
        confirmLabel="Cancel this order"
        cancelLabel="Keep it open"
        busy={pending}
        onConfirm={() => {
          setConfirming(false);
          const btn = cancelRef.current;
          if (btn) formRef.current?.requestSubmit(btn);
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
