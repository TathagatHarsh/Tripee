"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { requireKitchen } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { applyStatusTransition } from "@/lib/orderTransition";

/**
 * Move one docket along the board.
 *
 * The board only renders buttons for legal transitions, but a form is not the
 * only thing that can post here and a page left open on a counter goes stale,
 * so the current status is read back and the move re-checked before anything
 * is written. An illegal move writes nothing and re-renders, which puts the
 * real state in front of whoever clicked — the board correcting itself is the
 * feedback, rather than a dialog explaining a race they did not know about.
 *
 * The same reasoning is why the role is checked here and not only on the board:
 * a Server Action is a POST to an endpoint whose id ships in the page payload,
 * and a layout does not re-run for it. Whoever advances a docket has to be a
 * baker at the moment they advance it, not merely to have been one when the tab
 * was opened. `requireKitchen` admits ADMIN too — see lib/roles' ROLE_RANK —
 * because the owner moving a docket at a busy counter is a Tuesday, not an
 * escalation. It refuses by throwing, so it is the first statement and is never
 * inside a `try`.
 *
 * The move itself is lib/orderTransition's, which the admin portal's order
 * detail also calls: it re-reads the status, asks lib/orders whether the move
 * is legal, writes conditionally on the status not having changed since, and
 * records who moved it. Two surfaces, one implementation — a second copy of
 * these rules is a second place for them to drift.
 */
export async function advanceOrder(formData: FormData) {
  const viewer = await requireKitchen();
  if (!hasDatabase()) return;

  const ref = String(formData.get("ref") ?? "");
  const to = String(formData.get("to") ?? "") as OrderStatus;
  if (!ref || !to) return;

  // A refused move is logged where the reason is known, in lib/orderTransition,
  // with the status it was refused from.
  await applyStatusTransition(ref, to, viewer.profile.id);

  // Refused or not, for the reason above: re-rendering the board puts the real
  // state in front of whoever clicked rather than a dialog about a race.
  revalidatePath("/kitchen");
}
