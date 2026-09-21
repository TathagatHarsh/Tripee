import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { GUEST_ORDER_COOKIE } from "./roles";

/**
 * How a guest gets back to the order they placed.
 *
 * ## The hole this fills, and the one it refuses to open
 *
 * Guest checkout has always worked — /api/orders writes `userId: null` for a
 * stranger and the cake gets baked — but the tracking page asks for a session
 * and then filters on the viewer's own id, so a guest's order was reachable by
 * nobody at all. The confirmation screen said as much: keep the reference, ring
 * the bakery. That is secure, and it is not tracking.
 *
 * The obvious fix is the wrong one. Letting `/orders/MC-8B3JQK` render for
 * anybody holding the reference turns six public characters into a password for
 * somebody's name, phone number and delivery window — and §10 rules it out in
 * as many words. A reference is read aloud down a phone line and printed on a
 * docket; it is an identifier, not a secret, and lib/checkout's `refForAttempt`
 * is explicit that nothing may depend on its unguessability.
 *
 * So what authorises a guest is not what they know but what they hold: a cookie
 * this server set, on this browser, at the moment the order was written. It
 * cannot be typed, guessed or forwarded in a WhatsApp message, and it needs no
 * new column, no token table and no migration.
 *
 * ## Why it is signed
 *
 * `httpOnly` stops a script reading the cookie; it does not stop the person at
 * the keyboard writing one. An unsigned list of references would let anybody
 * paste `MC-8B3JQK` into their own cookie jar and read a stranger's order —
 * precisely the disclosure this file exists to prevent. The HMAC is what makes
 * the cookie proof of having been *given* the reference by this server rather
 * than proof of having typed it.
 *
 * ## No `server-only` marker
 *
 * Deliberate, and the same call lib/imageSpec makes: the marker cannot be
 * imported by a test file, and the signing is the part of this most worth
 * holding to a table. `next/headers` cannot be bundled into a client component
 * anyway, so the boundary is still enforced by the build — just by the import
 * below rather than by a marker above it.
 */

/* The name lives in lib/roles because proxy.ts needs it and cannot import
   this module — see the note there. One literal, two runtimes. */
const COOKIE = GUEST_ORDER_COOKIE;

/**
 * How many references one browser carries. Twenty is a long history for a
 * bakery and keeps the header comfortably small; the oldest falls off the end.
 */
const MAX_REFS = 20;

/** Long enough that a birthday cake ordered in advance is still trackable. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 120;

/** References are minted by this server, so the shape is known exactly. */
const REF = /^MC-[A-Z2-9]{6}$/;

/**
 * The key the cookie is signed with.
 *
 * `ORDER_TOKEN_SECRET` if the deployment sets one, and otherwise a secret it
 * already has. The fallbacks are not a shortcut around configuration — they are
 * what makes guest tracking work on day one rather than silently staying off
 * until somebody notices a variable in an example file. Both are server-side
 * deployment secrets of the same tier, neither is ever sent to a browser, and
 * an HMAC reveals nothing about its key.
 *
 * Rotating whichever one is in use invalidates every outstanding cookie, which
 * costs a guest their tracking link and nothing else. Set `ORDER_TOKEN_SECRET`
 * explicitly if that matters.
 *
 * Null is a real state: a deployment with no secrets at all still takes orders,
 * and guest tracking is simply not offered rather than offered unsigned.
 */
function secret(): string | null {
  return (
    process.env.ORDER_TOKEN_SECRET
    || process.env.CLERK_SECRET_KEY
    || process.env.DATABASE_URL
    || null
  );
}

export function guestTrackingEnabled(): boolean {
  return secret() !== null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/**
 * `payload.signature`, where the payload is the references separated by `~`.
 *
 * `~` rather than a comma because a comma is not legal in a cookie value, and
 * base64url for the signature for the same reason. Both halves are therefore
 * safe to put in a `Set-Cookie` with no further escaping.
 */
export function encodeRefs(refs: string[], key: string): string {
  const payload = refs.join("~");
  return `${payload}.${sign(payload, key)}`;
}

/**
 * The references in a cookie this server actually signed, or none.
 *
 * Pure, and exported for the tests: every way this can be got wrong — a forged
 * list, a truncated signature, a signature from a different key, a reference
 * appended to a genuine payload — is a way somebody reads a stranger's order,
 * and that is a property worth holding to a table rather than to a comment.
 *
 * `timingSafeEqual` because comparing HMACs with `===` leaks how much of a
 * guess was right, one byte at a time. It throws on a length mismatch, so the
 * lengths are checked first and a wrong-length signature is simply rejected.
 */
export function decodeRefs(value: string | undefined, key: string): string[] {
  if (!value) return [];

  const cut = value.lastIndexOf(".");
  if (cut <= 0) return [];

  const payload = value.slice(0, cut);
  const given = Buffer.from(value.slice(cut + 1), "base64url");
  const want = Buffer.from(sign(payload, key), "base64url");

  if (given.length !== want.length || !timingSafeEqual(given, want)) return [];

  /* Signed by us, so the shape is ours too — but filtered anyway, because a
     value that survives the signature check still goes straight into a database
     query, and "it must be fine, we signed it" is how the next bug gets in. */
  return payload.split("~").filter((r) => REF.test(r)).slice(0, MAX_REFS);
}

/* ------------------------------------------------------------ the request */

/** Every order this browser has placed, as far as this server can verify. */
export async function readGuestOrderRefs(): Promise<string[]> {
  const key = secret();
  if (!key) return [];

  try {
    return decodeRefs((await cookies()).get(COOKIE)?.value, key);
  } catch {
    // Read outside a request scope, or a cookie store that refused. Neither is
    // a reason to fail a page — it is a viewer with no guest orders.
    return [];
  }
}

/**
 * Whether this browser placed this order.
 *
 * The whole of the guest authorisation, and deliberately a single predicate, so
 * a page has one thing to call and no opportunity to spell the check
 * differently from the next page that needs it.
 */
export async function holdsGuestOrder(ref: string): Promise<boolean> {
  return (await readGuestOrderRefs()).includes(ref);
}

/**
 * Add references this browser may now track.
 *
 * Newest first and capped, so a regular customer keeps their recent orders and
 * the header does not grow without bound. Called once, from the order route,
 * after the rows are committed — a cookie promising access to an order that was
 * never written would be a tracking link to a 404.
 *
 * Failure is swallowed for lib/notify's reason: a cookie that could not be set
 * costs somebody a convenience, and must never cost them an order that is
 * already in the database.
 */
export async function rememberGuestOrders(refs: string[]): Promise<void> {
  const key = secret();
  if (!key || refs.length === 0) return;

  try {
    const jar = await cookies();
    const existing = decodeRefs(jar.get(COOKIE)?.value, key);
    const merged = [...new Set([...refs, ...existing])].slice(0, MAX_REFS);

    jar.set(COOKIE, encodeRefs(merged, key), {
      httpOnly: true,
      /* Lax, not Strict: somebody following the tracking link out of a WhatsApp
         message is a top-level navigation and should arrive at their own order
         rather than at a 404 they have to reload to fix. */
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  } catch (e) {
    console.error("guest_cookie_write_failed", e);
  }
}
