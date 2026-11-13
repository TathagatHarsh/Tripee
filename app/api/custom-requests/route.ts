import { callerKey, CROSS_SITE_MESSAGE, crossSite, rateLimit, tooMany } from "@/lib/apiGuard";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { createCustomRequest } from "@/lib/customRequests";
import { CustomRequestInput } from "@/lib/customRules";
import { checkDeliveryServiceability } from "@/lib/delivery";
import { checkChoice } from "@/lib/deliveryRules";
import { log } from "@/lib/log";
import { paymentCheckoutAvailable } from "@/lib/razorpay";
import { ACCEPTED_TYPES, hasImageStore, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { indianMobile, whatsappConfigured } from "@/lib/whatsapp";

const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  if (crossSite(req)) return fail(CROSS_SITE_MESSAGE, 403);
  const limit = rateLimit("custom-requests", callerKey(req), { max: 5, windowSeconds: 3600 });
  if (!limit.ok) return tooMany(limit, "custom cake requests");
  if (!whatsappConfigured() || !hasImageStore() || !paymentCheckoutAvailable()) return fail("Custom cake requests aren't available right now.", 503);

  // Refuse before buffering: formData() reads the whole body. The allowance covers the other form fields.
  const length = Number(req.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0 || length > MAX_UPLOAD_BYTES + 64 * 1024) return fail("That photo is too large.", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Expected a form submission", 400);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("data")));
  } catch {
    return fail("Expected request details", 400);
  }
  const parsed = CustomRequestInput.safeParse(raw);
  const photo = form.get("photo");
  const fieldErrors: Record<string, string[]> = parsed.success ? {} : Object.fromEntries(Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v ?? []]));
  if (!(photo instanceof File) || photo.size === 0) fieldErrors.photo = ["Add a photo of the cake you have in mind"];
  if (!parsed.success || !(photo instanceof File) || photo.size === 0) return fail("Please check the highlighted details.", 400, { fieldErrors });
  const input = parsed.data;
  if (!indianMobile(input.phone)) return fail("Please check the highlighted details.", 400, { fieldErrors: { phone: ["Enter a 10-digit mobile number"] } });
  if (photo.size > MAX_UPLOAD_BYTES) return fail("That photo is too large.", 413);
  if (!(ACCEPTED_TYPES as readonly string[]).includes(photo.type)) return fail("Use a JPEG, PNG or WebP photo.", 415);

  const catalog = await getCatalogSnapshot();
  if (!checkDeliveryServiceability({ postalCode: input.address.pincode }, catalog).serviceable)
    return fail("We don't deliver there yet", 422, { fieldErrors: { address: ["We don't deliver there yet"] } });
  const verdict = checkChoice({ slot: "scheduled", date: input.dueDate, window: input.dueWindow }, new Date(), "custom", catalog.deliveryRules);
  if (!verdict.ok) return fail(verdict.message, 422, { fieldErrors: { dueAt: [verdict.message] } });
  const { dueDate: _d, dueWindow: _w, ...rest } = input;

  try {
    const { ref } = await createCustomRequest({ ...rest, dueAt: verdict.dueAt.toISOString() }, Buffer.from(await photo.arrayBuffer()));
    return Response.json({ ref }, { status: 201 });
  } catch (error) {
    log("error", "custom_request_failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("We couldn't send your request. Please try again.", 500);
  }
}
