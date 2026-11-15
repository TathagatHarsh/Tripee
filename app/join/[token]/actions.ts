"use server";

import { getViewer } from "@/lib/auth";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/vendorInvite";

export type JoinState = { message: string } | undefined;

const REFUSAL = {
  expired: "This invite has expired. Ask MakeYourCakes for a new one.",
  staff: "This account is MakeYourCakes staff and can't be a bakery. Sign in with a different account.",
  other_bakery: "This account already belongs to another bakery.",
} as const;

/** The person is whoever the session says, never a form field: this is the one action that sets a role. */
export async function acceptJoin(token: string): Promise<JoinState> {
  // getViewer runs loadProfile, which creates the CUSTOMER row a brand-new sign-up does not have yet.
  const viewer = await getViewer();
  if (!viewer) return { message: "We couldn't check your account. Reload and try again." };

  const r = await acceptInvite(token, viewer.userId);
  if (!r.ok) return { message: REFUSAL[r.reason] };
  redirect("/vendor");
}
