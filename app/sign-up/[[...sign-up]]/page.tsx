import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AuthSheet, clerkAppearance } from "@/components/AuthSheet";

/**
 * Creating an account is optional in this product and always has been — see the
 * line under the sheet. Nothing here grants a role: every account Clerk mints
 * arrives as a CUSTOMER, because lib/auth's `loadProfile` creates the row with
 * the column default and there is no field on this form, or anywhere in the
 * request, that could say otherwise.
 */

export const metadata: Metadata = {
  title: "Create an account — Makemycake",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <AuthSheet title="Create an account" lede="So the cakes you design are still here next time. You never needed one to order — this only saves you typing it twice.">
      <SignUp appearance={clerkAppearance} />
    </AuthSheet>
  );
}
