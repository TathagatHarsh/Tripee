import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import type { Metadata } from "next";
import { shopClerkAppearance } from "@/components/AuthSheet";
import { requireRole } from "@/lib/auth";
import { sCard, sEyebrow } from "@/lib/shopUi";

/**
 * The profile, and login & security — Clerk's, on our paper.
 *
 * ## Why Clerk's component and not a form of ours
 *
 * Because the fields are not the feature. Changing an email address means
 * sending a verification to the new one and keeping the old one live until it
 * is confirmed; changing a password means the old-password check, the breach
 * list and the sessions on other devices; and "connected accounts" is an OAuth
 * flow per provider. `UserProfile` carries all of it, and it carries it against
 * the same session `auth()` reads — a hand-rolled sheet posting to an endpoint
 * of ours would be a second identity surface to keep correct, for the same
 * reason components/AuthSheet gives about `<SignIn>`.
 *
 * It also cannot touch a role. Every field on this page belongs to Clerk;
 * `UserProfile.role` is a column in Postgres that nothing on a request path
 * writes — see lib/auth's `loadProfile`, whose security property is what it
 * does *not* write. Somebody can change their name here and their authority is
 * exactly what it was.
 *
 * ## The catch-all segment
 *
 * `[[...rest]]`, because Clerk's profile is several screens behind one URL —
 * the account panel, the security panel, an email-verification step, an OAuth
 * callback — and each is a path under this one rather than a page of its own.
 * That is also what makes /account/profile/security a real destination for the
 * card on the account page: this segment answers it, and Clerk routes it.
 *
 * ## The dress
 *
 * The `auth-sheet` class is still the sign-in page's, and still does the same
 * structural job: Clerk's own card chrome switched off, so there is one sheet on
 * screen rather than a card inside a card.
 *
 * The palette is not. This page moved inside the storefront's chrome with the
 * rest of /account, so it wears `shopClerkAppearance` — cream, cocoa and berry,
 * with corners — while /sign-in and /sign-up keep `clerkAppearance` exactly as
 * it was. Two objects rather than one edited object, for the reason
 * components/AuthSheet gives beside them: only one of the pages moved.
 */

export const metadata: Metadata = {
  title: "Profile & security · MakeYourCakes",
  robots: { index: false, follow: false },
};

export default async function Profile() {
  // First statement, and never inside a try: this refuses by throwing. The page
  // is guarded on its own rather than by the layout, for the reason
  // app/account/layout.tsx gives.
  await requireRole("CUSTOMER");

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href="/account"
          className="inline-flex min-h-11 items-center self-start font-mono text-[0.6875rem] tracking-[0.13em] text-s-bark uppercase transition-colors hover:text-s-cocoa"
        >
          ← Your account
        </Link>
        <span className={sEyebrow}>Account</span>
        <h1 className="text-[2.25rem] sm:text-[2.75rem]">Profile &amp; security</h1>
        <p className="max-w-[56ch] text-[1.0625rem] leading-relaxed text-s-bark">
          Your name, your email address, how you sign in, and the devices you are
          signed in on. Changing any of it here changes it everywhere you use this
          account.
        </p>
      </div>

      {/*
        `auth-sheet` is what app/globals.css hangs the Clerk overrides off — the
        card chrome, the radii, the field heights — and it is scoped rather than
        global so none of it reaches the account menu in the shopfront header.

        `routing="path"` with the `path` this segment is mounted at: Clerk then
        navigates between its own panels with real URLs, which is what lets the
        account page link straight to the security one.
      */}
      <div className={`auth-sheet ${sCard} p-4 sm:p-6`}>
        <UserProfile
          appearance={shopClerkAppearance}
          routing="path"
          path="/account/profile"
        />
      </div>
    </>
  );
}
