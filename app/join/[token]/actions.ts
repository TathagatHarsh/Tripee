"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/vendorInvite";

export type JoinState = { message: string } | undefined;

const REFUSAL = {
  expired: "This invite has expired. Ask MakeYourCakes for a new one.",
  staff: "This account is MakeYourCakes staff and can't be a bakery. Sign in with a different account.",
  other_bakery: "This account already belongs to another bakery.",
} as const;

/** The person is whoever the session says, never a form field: this is the one action that sets a role. */
export async function acceptJoin(token: string, _prev: JoinState, _form: FormData): Promise<JoinState> {
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/join/${token}`)}`);

  const r = await acceptInvite(token, userId);
  if (!r.ok) return { message: REFUSAL[r.reason] };
  redirect("/vendor");
}
