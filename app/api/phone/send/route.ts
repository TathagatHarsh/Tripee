import { callerKey, CROSS_SITE_MESSAGE, crossSite, rateLimit, tooMany } from "@/lib/apiGuard";
import { log } from "@/lib/log";
import { issueCode, phoneVerificationOn } from "@/lib/phoneVerify";
import { indianMobile, sendWhatsApp } from "@/lib/whatsapp";
import { verifyCodeMessage } from "@/lib/whatsappMessages";

const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  if (crossSite(req)) return fail(CROSS_SITE_MESSAGE, 403);
  if (!phoneVerificationOn()) return fail("Not found", 404);

  let body: { phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Expected a JSON body", 400);
  }
  const phone = typeof body?.phone === "string" ? indianMobile(body.phone) : null;
  if (!phone) return fail("Enter a 10-digit mobile number", 400, { field: "customerPhone" });

  const byCaller = rateLimit("phone-send", callerKey(req), { max: 5, windowSeconds: 3600 });
  if (!byCaller.ok) return tooMany(byCaller, "verification codes");
  const byNumber = rateLimit("phone-send-number", phone, { max: 3, windowSeconds: 3600 });
  if (!byNumber.ok) return tooMany(byNumber, "verification codes for this number");

  try {
    const { code, token } = issueCode(phone);
    await sendWhatsApp(phone, verifyCodeMessage(code));
    return Response.json({ token });
  } catch (error) {
    log("error", "phone_code_send_failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("We couldn't send the code right now. Try again in a minute, or write to hello@makeyourcakes.com.", 503);
  }
}
