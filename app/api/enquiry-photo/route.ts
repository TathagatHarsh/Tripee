import { callerKey, CROSS_SITE_MESSAGE, crossSite, rateLimit, tooMany } from "@/lib/apiGuard";
import { log } from "@/lib/log";
import { hasImageStore, ImageError, MAX_UPLOAD_BYTES, optimize, store } from "@/lib/storage";

/**
 * The photo a customer attaches to a WhatsApp custom-cake enquiry.
 *
 * wa.me links carry text only, so the photo is stored here and the message
 * carries its URL. No database row: the chat is the record. `optimize` re-encodes
 * to WebP (strips EXIF, refuses anything that isn't a real JPEG/PNG/WebP).
 */
const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request) {
  if (crossSite(req)) return fail(CROSS_SITE_MESSAGE, 403);
  const limit = rateLimit("enquiry-photo", callerKey(req), { max: 10, windowSeconds: 3600 });
  if (!limit.ok) return tooMany(limit, "photo uploads");
  if (!hasImageStore()) return fail("Photo uploads aren't available right now.", 503);

  // Refuse before buffering: formData() reads the whole body.
  const length = Number(req.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0 || length > MAX_UPLOAD_BYTES + 16 * 1024) return fail("That photo is too large.", 413);

  let photo: FormDataEntryValue | null;
  try {
    photo = (await req.formData()).get("photo");
  } catch {
    return fail("Expected a photo", 400);
  }
  if (!(photo instanceof File) || photo.size === 0) return fail("Expected a photo", 400);

  try {
    const url = await store(await optimize(Buffer.from(await photo.arrayBuffer()), undefined, true), "enquiry", "photo");
    return Response.json({ url }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageError) return fail(error.message, 415);
    log("error", "enquiry_photo_failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("We couldn't upload that photo. Please try again.", 500);
  }
}
