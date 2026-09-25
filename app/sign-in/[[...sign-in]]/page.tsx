import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AuthSheet, authClerkAppearance } from "@/components/AuthSheet";

/**
 * A catch-all segment because Clerk's flow has more than one screen behind this
 * URL — a second factor, a password reset, an SSO callback — and each is a path
 * under it rather than a page of its own. Every one of them renders inside the
 * shell below, so the verification step and the reset step wear the same
 * photograph and the same heading treatment as the first screen did.
 */

export const metadata: Metadata = {
  title: "Sign in — MakeYourCakes",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <AuthSheet
      title="Welcome back"
      lede="Sign in to follow your orders and keep your favourite cakes in one place."
    >
      <SignIn appearance={authClerkAppearance} fallbackRedirectUrl="/post-sign-in" />
    </AuthSheet>
  );
}
