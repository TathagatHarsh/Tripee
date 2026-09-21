import { CakeConfig, migrateConfig } from "./schema";

/** Base64url so a design survives a WhatsApp forward without escaping. */
export function encodeConfig(c: CakeConfig): string {
  const json = JSON.stringify(c);
  const b64 = typeof window === "undefined"
    ? Buffer.from(json, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(s: string): CakeConfig | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof window === "undefined"
      ? Buffer.from(b64, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(b64)));
    return migrateConfig(JSON.parse(json));
  } catch {
    return null;
  }
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * The alphabet, applied to bytes somebody else chose.
 *
 * Split out from `makeSlug` for lib/checkout's `refForAttempt`, which needs the
 * same thirty-one characters over the bytes of a digest rather than over random
 * ones. Sharing the mapping is what keeps every reference in the product — drawn
 * or derived — matching the one pattern the e2e suite and the bakery's own eyes
 * expect.
 */
export function slugFromBytes(bytes: Uint8Array, len = 6): string {
  return Array.from(bytes.slice(0, len), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Short, unambiguous slug for `/d/[slug]`. No 0/O/1/l/i confusion. */
export function makeSlug(len = 7): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return slugFromBytes(bytes, len);
}

/**
 * The reference a customer keeps and reads back down a phone line.
 *
 * This was `MC-` plus a number in 1000..9999 — 9,000 values against a UNIQUE
 * constraint on `Order.ref`. The birthday bound puts the first collision at
 * around 110 orders; at 4,500 orders five retries fail ~3% of the time; past
 * 9,000 every order fails forever. The retry loop in /api/orders was
 * load-bearing rather than the backstop it reads as.
 *
 * The slug alphabet is already here and already excludes O/0 and I/l/1, so
 * reusing it gives 31^6 ≈ 8.9e8 and puts the retry back to being a backstop.
 * Uppercased because a reference gets read aloud and written down.
 */
export function makeOrderRef(): string {
  return "MC-" + makeSlug(6).toUpperCase();
}
