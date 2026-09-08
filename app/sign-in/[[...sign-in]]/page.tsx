import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AuthSheet, clerkAppearance } from "@/components/AuthSheet";

/**
 * A catch-all segment because Clerk's flow has more than one screen behind this
 * URL — a second factor, a password reset, an SSO callback — and each is a path
 * under it rather than a page of its own.
 */

export const metadata: Metadata = {
  title: "Sign in — Makemycake",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <AuthSheet title="Sign in" lede="For your saved cakes, and for the bakery's own two boards.">
      <SignIn appearance={clerkAppearance} />
    </AuthSheet>
  );
}
