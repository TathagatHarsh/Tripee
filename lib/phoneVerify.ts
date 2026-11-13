import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { indianMobile } from "./phone";

export const PHONE_COOKIE = "myc_phone";
export const PROVEN_SECONDS = 30 * 86400;
const CODE_MS = 10 * 60_000;

export const phoneVerificationOn = () => process.env.PHONE_VERIFICATION === "on";

const secret = () => process.env.WHATSAPP_APP_SECRET ?? "";
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** A fresh 6-digit code and a stateless token binding it to the phone and an expiry. */
export function issueCode(phone: string, now = Date.now()): { code: string; token: string } {
  if (!secret()) throw new Error("phone_verify_no_secret");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = now + CODE_MS;
  return { code, token: `${expiresAt}.${sign(`otp:${phone}:${code}:${expiresAt}`)}` };
}

/** "wrong" is reported before "expired": only a validly signed token can be expired. */
export function checkCode(phone: string, code: string, token: string, now = Date.now()): "ok" | "wrong" | "expired" {
  if (!secret()) return "wrong";
  const [expiresAt, sig, ...rest] = token.split(".");
  if (!expiresAt || !sig || rest.length || !/^\d+$/.test(expiresAt)) return "wrong";
  if (!same(sig, sign(`otp:${phone}:${code}:${expiresAt}`))) return "wrong";
  return now > Number(expiresAt) ? "expired" : "ok";
}

export function provenCookie(phone: string, now = Date.now()): string {
  const expiresAt = now + PROVEN_SECONDS * 1000;
  return `${phone}.${expiresAt}.${sign(`pv:${phone}:${expiresAt}`)}`;
}

/** The phone a valid, unexpired proven-phone cookie vouches for, else null. */
export function provenPhone(value: string | null | undefined, now = Date.now()): string | null {
  if (!value || !secret()) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [phone, expiresAt, sig] = parts;
  if (!/^\d+$/.test(expiresAt) || !same(sig, sign(`pv:${phone}:${expiresAt}`))) return null;
  return now > Number(expiresAt) ? null : phone;
}

/** A 422 response when the order's phone is not proven (flag on, unpaid); null when fine. */
export async function phoneProblem(customerPhone: string, paid: boolean): Promise<Response | null> {
  if (!phoneVerificationOn() || paid) return null;
  let value: string | undefined;
  try {
    value = (await cookies()).get(PHONE_COOKIE)?.value;
  } catch {
    value = undefined; // no request scope
  }
  const proven = provenPhone(value);
  if (proven && proven === indianMobile(customerPhone)) return null;
  return Response.json(
    { error: "Verify your number on WhatsApp to continue.", code: "phone_unverified", field: "customerPhone" },
    { status: 422 },
  );
}
