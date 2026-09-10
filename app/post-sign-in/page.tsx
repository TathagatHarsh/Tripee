import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where a plain sign-in lands, role read fresh off the session that just formed.
 *
 * Only reached as Clerk's `fallbackRedirectUrl` on /sign-in — used when the page
 * was not carrying a `redirect_url` of its own, which is the bounce-back case
 * `requireRole` already builds (lib/auth.ts) and this route never touches. So
 * the two paths back from /sign-in stay independent: aim at a guarded page and
 * Clerk sends you back to exactly that page; sign in from anywhere else and you
 * land where your role does.
 */
export default async function PostSignIn() {
  const viewer = await getViewer();
  redirect(viewer?.profile.role === "ADMIN" ? "/admin" : "/account");
}
