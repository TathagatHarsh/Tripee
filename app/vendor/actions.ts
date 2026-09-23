"use server";

import { revalidatePath } from "next/cache";
import type { VendorOrderStatus } from "@prisma/client";
import { requireVendor } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { applyVendorTransition } from "@/lib/vendorTransition";
import { composeRejection, VENDOR_ACTION_LABEL } from "@/lib/vendors";

/**
 * The only write a partner bakery can make.
 *
 * One action rather than five, because they are one move with a different
 * destination — the same arrangement the admin's `advanceOrderStatus` has, and
 * for the same reason: a browser sends only the clicked submit button's name and
 * value, so `to` arrives correct without any JavaScript deciding it, and there
 * is one place where the rules are re-checked rather than five.
 *
 * ## requireVendor() first, on this one action
 *
 * app/vendor/layout.tsx guards the pages, and a layout does not run for an
 * action — a Server Action is a POST to an endpoint whose id ships in the
 * page's own payload, and having once been a vendor is not the same as being
 * one now. So the check is here, first, and never inside a `try`, because it
 * refuses by throwing a redirect.
 *
 * The important half is the second half: `requireVendor` returns the bakery this
 * session *is*, read off their profile row, and that id is what
 * `applyVendorTransition` scopes the write by. **Nothing in this form names a
 * vendor.** There is no field to tamper with, no id in the URL, and no argument
 * that could carry one — which is why a vendor cannot act on another vendor's
 * assignment even knowing its order reference.
 *
 * The order reference *is* from the form, and is deliberately not trusted: it
 * goes into a WHERE beside the session's own vendorId, so a reference belonging
 * to another bakery simply matches nothing.
 */

/**
 * Declared here rather than imported from the admin portal.
 *
 * The shape is the same four characters wide and the temptation is to share it,
 * but importing from app/admin/actions.ts would tie a vendor's client bundle to
 * the module that holds every write in the shop. Two small interfaces are
 * cheaper than that seam.
 */
export interface ActionResult {
  ok: boolean;
  message: string;
}

/** The statuses this action will accept, which is not every status there is. */
const VENDOR_MOVES: VendorOrderStatus[] = [
  "accepted",
  "rejected",
  "in_preparation",
  "ready",
  "handed_over",
];

export async function moveAssignment(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  const { vendor, userId } = await requireVendor();
  if (!hasDatabase()) {
    return { ok: false, message: "This deployment has no database, so nothing can be saved." };
  }

  const ref = String(form.get("ref") ?? "");
  const to = String(form.get("to") ?? "") as VendorOrderStatus;

  if (!ref) return { ok: false, message: "That move is missing an order." };
  /*
   * A closed list checked before anything else, so `withdrawn` — which is the
   * office taking an order back, not a bakery's move — cannot be reached from
   * here even though it is a valid value of the enum. lib/vendors' VENDOR_NEXT
   * would refuse it too; this refuses it one layer earlier and says why.
   */
  if (!VENDOR_MOVES.includes(to)) {
    return { ok: false, message: "That is not a move you can make on an order." };
  }

  /*
   * Why they said no, out of a tapped reason and an optional note.
   *
   * The note is trimmed and capped here rather than trusted from the form: the
   * textarea's `maxLength` is a courtesy to somebody typing, and a POST does not
   * have to come from that textarea. 300 characters is long enough for a real
   * sentence about a cake and short enough that nothing can be written into this
   * column at volume.
   *
   * The reason *id* never reaches the database. `composeRejection` turns it into
   * the sentence the office reads on the order's own page — see lib/vendors for
   * why a stored `too_busy` would need a second lookup table to be legible at
   * all. An id this build does not know contributes nothing, which is the safe
   * reading of a value that did not come from the radio group.
   *
   * Only ever stored against a rejection; `applyVendorTransition` drops it on
   * any other move. Null when neither half was given, which is a bakery
   * declining without explaining and is allowed.
   */
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;
  const reason = composeRejection(String(form.get("reason") ?? ""), note);

  if (to === "rejected" && !reason) return { ok: false, message: "Choose a rejection reason or enter a note." };

  const moved = await applyVendorTransition(vendor.id, ref, to, reason, String(form.get("assignmentId") ?? ""), userId);

  revalidatePath("/vendor");
  /* The history list too: a decline moves an order off the board and onto it,
     and a stale list is a bakery unable to find the order they just declined. */
  revalidatePath("/vendor/orders");
  revalidatePath(`/vendor/orders/${ref}`);
  /* The office is watching this order too. Their page reads the same rows, so
     it has to be told the answer changed. */
  revalidatePath(`/admin/orders/${ref}`);

  return moved
    ? { ok: true, message: `${VENDOR_ACTION_LABEL[to].replace(/ order$/, "")} — done.` }
    : {
      ok: false,
      message:
        "That is no longer available — this order has changed since this page "
        + `loaded. Reload to see where it is${
          to === "accepted" ? ", and whether it is still yours" : ""
        }.`,
    };
}
