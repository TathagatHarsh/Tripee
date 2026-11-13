import { cookies } from "next/headers";
import { callerKey, CROSS_SITE_MESSAGE, crossSite, rateLimit, tooMany } from "@/lib/apiGuard";
import { checkCode, PHONE_COOKIE, phoneVerificationOn, provenCookie, PROVEN_SECONDS } from "@/lib/phoneVerify";
import { indianMobile } from "@/lib/whatsapp";

const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  if (crossSite(req)) return fail(CROSS_SITE_MESSAGE, 403);
  if (!phoneVerificationOn()) return fail("Not found", 404);

  let body: { phone?: unknown; code?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Expected a JSON body", 400);
  }
  const phone = typeof body?.phone === "string" ? indianMobile(body.phone) : null;
  if (!phone) return fail("Enter a 10-digit mobile number", 400, { field: "customerPhone" });

  // ponytail: per-instance rateLimit; Vercel Firewall or a shared counter if guessing is ever seen
  const limit = rateLimit("phone-verify", `${callerKey(req)}:${phone}`, { max: 5, windowSeconds: 600 });
  if (!limit.ok) return tooMany(limit, "attempts");

  const code = typeof body.code === "string" ? body.code : "";
  const token = typeof body.token === "string" ? body.token : "";
  const result = checkCode(phone, code, token);
  if (result === "wrong") return fail("That code isn't right.", 400);
  if (result === "expired") return fail("That code has expired. Send a new one.", 410);

  (await cookies()).set(PHONE_COOKIE, provenCookie(phone), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: PROVEN_SECONDS });
  return Response.json({ phone });
}
