"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { assignVendor, type ActionResult } from "../../actions";
import { useToast } from "@/components/admin/Toast";
import { aBtn, aField } from "@/components/admin/ui";
import { Icon } from "@/components/admin/icons";

/**
 * Hand this order to a bakery, or move it to a different one.
 *
 * One control for both, because they are one operation — see
 * `assignOrderToVendor` in lib/vendorTransition, which withdraws whoever held it
 * and records that it did. What changes between the two cases is only the
 * wording and whether the picker is behind a button: an unassigned order wants
 * the picker open, because assigning is why somebody opened the page; an
 * assigned one wants it shut, because changing bakeries mid-order is rare and a
 * live dropdown beside a working assignment is an invitation to a mis-click.
 *
 * The list is only the *active* vendors. The server refuses an inactive one
 * anyway — a tab left open across a deactivation is exactly how a deactivated
 * bakery would otherwise be sent work — so this is the convenience and that is
 * the rule.
 */
export function AssignVendor({
  orderRef,
  vendors,
  assigned,
}: {
  orderRef: string;
  vendors: { id: string; name: string }[];
  /** The bakery holding it now, if any. Only its name is used, for the prompt. */
  assigned: string | null;
}) {
  const [result, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    assignVendor,
    undefined,
  );
  const { toast } = useToast();
  /*
   * Open by default when nobody holds the order, shut when somebody does.
   *
   * Collapsing it again after a successful move is not done here — it is done by
   * remounting: the parent keys this component on the live assignment's id, so a
   * new assignment is a new component with a freshly-initialised `open`. An
   * effect that called `setOpen` would be state chasing a prop, which is the
   * thing React asks you not to write and the thing that goes wrong when the two
   * disagree for a render.
   */
  const [open, setOpen] = useState(!assigned);

  useEffect(() => {
    if (result) toast(result.message, result.ok);
  }, [result, toast]);

  if (vendors.length === 0) {
    return (
      <p className="text-a-small leading-relaxed text-a-muted">
        No active bakeries, so there is nobody to assign this to.{" "}
        <Link
          href="/admin/vendors"
          className="font-medium text-a-accent-ink underline decoration-a-accent-line underline-offset-2"
        >
          Add one
        </Link>{" "}
        first.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={aBtn("secondary", "md")}>
        Change bakery
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="ref" value={orderRef} />

      <label className="flex flex-col gap-1">
        <span className="sr-only">Bakery</span>
        <select name="vendorId" required defaultValue="" className={aField("w-full")}>
          <option value="" disabled>
            Choose a bakery&hellip;
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={aBtn("primary", "md")}>
          {pending ? "Assigning…" : assigned ? "Move this order" : "Assign order"}
          {!pending && <Icon name="arrowRight" size={15} />}
        </button>
        {assigned && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className={aBtn("quiet", "md")}
          >
            Keep {assigned}
          </button>
        )}
      </div>

      {assigned && (
        <p className="text-a-meta leading-relaxed text-a-muted">
          {assigned} keeps their place in this order&rsquo;s history — the assignment
          is recorded as taken back rather than deleted.
        </p>
      )}

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
  );
}
