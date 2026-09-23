"use client";

import { useActionState, useState } from "react";
import type { VendorOrderStatus } from "@prisma/client";
import { moveAssignment, type ActionResult } from "./actions";
import { REJECTION_REASONS, VENDOR_ACTION_LABEL } from "@/lib/vendors";
import { aBtn, aField } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

/**
 * The moves this assignment can make, as buttons a floury thumb can hit.
 *
 * Only the legal ones are drawn — `next` is lib/vendors' VENDOR_NEXT for the
 * status the server just read — and the server checks again anyway, because a
 * board open on a phone since this morning is a board whose buttons describe a
 * state the office may have changed since. The buttons are the convenience; the
 * recheck is the correctness.
 *
 * One form with several submit buttons rather than a form each, for
 * StatusActions' reason: the browser sends only the clicked button's value, so
 * nothing in JavaScript decides which move this is, and one `useActionState`
 * disables the whole group while a move is in flight — which is what stops an
 * impatient double-tap from posting twice.
 *
 * `min-h-12` on every control. This is a phone in a working kitchen, and 44px is
 * the smallest target anybody should be asked to hit with the side of a thumb.
 *
 * ## Declining, and why it asks a question
 *
 * §12. The reason panel is revealed rather than always present, and it offers
 * five taps before it offers a keyboard. That ordering is the whole point: an
 * empty textarea at six in the morning gets "no" typed into it, and "no" is the
 * one answer that tells the office nothing about who to try next. A tapped
 * reason is one thumb and is still true.
 *
 * Nothing is required. A bakery too busy to explain is still allowed to say no,
 * and a mandatory field would only produce a mandatory non-answer. When a reason
 * *is* given it is the most useful thing on the office's screen, because it is
 * what they read before choosing the next bakery.
 */
export function OrderActions({
  orderRef,
  assignmentId,
  next,
  compact = false,
}: {
  orderRef: string;
  assignmentId: string;
  next: VendorOrderStatus[];
  /** The board card's version: forward move only, no decline, no reason panel. */
  compact?: boolean;
}) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    moveAssignment,
    undefined,
  );
  const [declining, setDeclining] = useState(false);

  const forward = next.filter((s) => s !== "rejected");
  const canDecline = next.includes("rejected") && !compact;

  if (next.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="ref" value={orderRef} /><input type="hidden" name="assignmentId" value={assignmentId} />

      {declining && canDecline && (
        <fieldset className="flex flex-col gap-2 rounded-a border border-a-bad-line bg-a-bad-wash p-3">
          <legend className="px-1 font-a-sans text-a-body font-semibold text-a-bad-ink">
            Why can&rsquo;t you take this order?
          </legend>

          {/*
            Radios rather than a <select>. A native select on a phone opens a
            wheel that covers the order being decided about, and five options do
            not need one. Each label is the tap target, at full width and 44px
            tall, so the thing being aimed at is the whole row and not a 16px
            circle.
          */}
          <div className="flex flex-col gap-0.5">
            {REJECTION_REASONS.map((reason) => (
              <label
                key={reason.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-a-sm px-2 text-a-body text-a-ink transition-colors hover:bg-a-surface has-checked:bg-a-surface has-checked:font-medium"
              >
                <input
                  type="radio"
                  name="reason"
                  value={reason.id}
                  disabled={pending}
                  className="size-4 shrink-0 accent-[var(--color-a-bad)]"
                />
                {reason.label}
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-a-sans text-a-small font-medium text-a-bad-ink">
              Anything else? The office reads this when they find somebody else.
            </span>
            <textarea
              name="note"
              rows={2}
              maxLength={300}
              placeholder="Cannot fit a 2kg truffle in today."
              disabled={pending}
              className={aField("w-full")}
            />
          </label>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {forward.map((s, i) => (
          <button
            key={s}
            type="submit"
            name="to"
            value={s}
            disabled={pending}
            className={aBtn(i === 0 ? "primary" : "secondary", "md", "min-h-12 grow sm:grow-0")}
          >
            {pending ? "Working…" : VENDOR_ACTION_LABEL[s]}
            {!pending && i === 0 && <Icon name="arrowRight" size={15} />}
          </button>
        ))}

        {canDecline && (
          declining ? (
            <>
              <button
                type="submit"
                name="to"
                value="rejected"
                disabled={pending}
                className={aBtn("secondary", "md", "min-h-12 text-a-bad-ink")}
              >
                {pending ? "Working…" : "Confirm decline"}
              </button>
              <button
                type="button"
                onClick={() => setDeclining(false)}
                disabled={pending}
                className={aBtn("quiet", "md", "min-h-12")}
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setDeclining(true)}
              disabled={pending}
              className={aBtn("quiet", "md", "min-h-12 text-a-bad-ink hover:bg-a-bad-wash")}
            >
              Decline
            </button>
          )
        )}
      </div>

      {/*
        Printed rather than toasted. There is no ToastProvider in this portal and
        adding one would be chrome for a single message — and the interesting
        failure here ("this order has changed since this page loaded") is one
        somebody needs to still be able to read while they work out what
        happened, which a four-second toast does not allow.
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
      {result?.ok && (
        <p role="status" className="text-a-small font-medium text-a-good-ink">
          {result.message}
        </p>
      )}
    </form>
  );
}
