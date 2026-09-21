import "server-only";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { type Crop, IMAGE_ASPECT, MAX_UPLOAD_BYTES, pixelBox } from "./imageSpec";

/*
 * Re-exported so every server caller keeps importing these from here, which is
 * where they used to live. They are defined in lib/imageSpec because the
 * cropper needs them too and importing this module from a client component
 * pulls `sharp` — and therefore `child_process` and `fs` — into the browser
 * bundle. That is not a hypothetical: it failed the build, and the
 * `import "server-only"` above did not catch it.
 */
export {
  ACCEPTED_EXTENSIONS, ACCEPTED_TYPES, type Crop, IMAGE_ASPECT, MAX_UPLOAD_BYTES,
  pixelBox,
} from "./imageSpec";

/**
 * Where a catalogue photograph goes, and what happens to it on the way.
 *
 * ## Why a provider at all
 *
 * There was none. Nothing in this project had ever accepted an upload: the
 * twenty-one preset photographs in /public/presets are committed files, rendered
 * offline by `npm run shoot:presets` from the same PRESETS array the builder
 * reads, and lib/photos.ts is an empty array with a comment explaining that
 * stock photography labelled "cakes we've delivered" would be a lie. So this is
 * a new capability rather than an extension of one, and the choice was made
 * deliberately rather than by reaching for whatever was nearest.
 *
 * Vercel Blob, because the deployment is already Vercel: the store is created in
 * the same dashboard, `BLOB_READ_WRITE_TOKEN` is injected into the environment
 * automatically, and the URLs it returns are already behind a CDN. The runners-up
 * both cost more than they saved. Supabase Storage would have added no new
 * vendor — the database is Supabase Postgres — but needs `supabase-js` back in
 * the bundle and a service-role key in the environment, and .env.example
 * explicitly documents removing those keys when Clerk replaced Supabase Auth; a
 * service-role key is a higher-privilege secret than this application currently
 * holds anywhere. Cloudinary has the best transforms and would make the sharp
 * work below unnecessary, and is a third vendor and a third account.
 *
 * ## Why the bytes are re-encoded rather than stored as they arrive
 *
 * A phone camera produces a 4-6MB JPEG at 4032x3024. Put that on a card in the
 * builder's filling picker and the customer downloads six megabytes to look at a
 * 200px square — §12 of the brief asks for exactly this not to happen. So every
 * upload is decoded, cropped to one aspect ratio, resized to one width and
 * re-encoded to WebP here, on the server, before a single byte reaches the
 * store. The original is not kept: keeping it would mean a second URL, a second
 * lifecycle and a second thing to delete, in exchange for a re-crop nobody has
 * asked for.
 *
 * Re-encoding is also the security boundary, and this is the more important
 * half. `sharp` decodes the image and writes new bytes from the decoded pixels,
 * so a file that is a valid JPEG *and* something else — a polyglot, an SVG with
 * a script in it, an HTML page with a JPEG header — cannot survive the round
 * trip: what comes out is a WebP written by libwebp from a pixel buffer. This is
 * why the declared MIME type from the browser is not trusted for anything and
 * why SVG is not an accepted format even though sharp can read it.
 */

/**
 * 1024x768.
 *
 * Sized for the largest place one of these is actually rendered — an option's
 * editor shows it at about 480px wide, and 2x that covers a retina screen with
 * nothing left over. next/image serves narrower variants from it for the cards.
 * Going to 2048 would double every stored byte to serve a screen no page in this
 * product has.
 */
const OUT_WIDTH = 1024;
const OUT_HEIGHT = Math.round(OUT_WIDTH / IMAGE_ASPECT);

/** Formats sharp is permitted to have decoded. Checked after decoding, not before. */
const DECODABLE = new Set(["jpeg", "png", "webp"]);

/** What went wrong, in words an owner can act on. Never a stack trace. */
export class ImageError extends Error {}

/**
 * Decode, crop, resize, re-encode.
 *
 * Returns WebP bytes at exactly OUT_WIDTH x OUT_HEIGHT, or throws an
 * `ImageError` whose message is safe to show somebody.
 */
export async function optimize(input: Buffer, crop?: Crop): Promise<Buffer> {
  if (input.byteLength === 0) throw new ImageError("That file is empty.");
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageError(
      `That photo is ${(input.byteLength / 1024 / 1024).toFixed(1)}MB. `
      + `The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB — most phone photos are well under it.`,
    );
  }

  /*
   * `limitInputPixels` is the second half of the size guard and the half that
   * catches a decompression bomb: a 4KB PNG can declare 60000x60000 and ask
   * sharp for 14GB of pixel buffer. 40 megapixels is comfortably more than any
   * camera an owner is holding and comfortably less than a bomb.
   *
   * `failOn: "error"` rather than the default "warning", which rejects images
   * with recoverable defects. A slightly truncated JPEG off a phone is a real
   * photograph somebody wants to use, and refusing it would be this module
   * being fussy about something that will re-encode perfectly well.
   */
  let pipeline: sharp.Sharp;
  let meta: sharp.Metadata;
  try {
    pipeline = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
    meta = await pipeline.metadata();
  } catch {
    throw new ImageError("That file isn't an image we can read. Try a JPG, PNG or WEBP.");
  }

  /*
   * The format is checked here, after decoding, rather than from the MIME type
   * the browser sent — which is a string in a request and worth nothing. This is
   * what refuses an SVG (sharp reports "svg") and a PDF, both of which sharp
   * would otherwise happily rasterise.
   */
  if (!meta.format || !DECODABLE.has(meta.format)) {
    throw new ImageError("That file isn't a photo we can use. Try a JPG, PNG or WEBP.");
  }
  if (!meta.width || !meta.height) {
    throw new ImageError("That image has no size we can read.");
  }

  /*
   * Rotate first, and by EXIF.
   *
   * A photograph taken in portrait on a phone is stored landscape with an
   * orientation tag, and every crop the admin drew was drawn on the *rotated*
   * preview the browser showed them. Cropping before rotating would apply their
   * box to a different picture than the one they were looking at — the classic
   * version of this bug, and it looks like the cropper is broken rather than
   * like the rotation is missing.
   *
   * `.rotate()` with no argument means "apply the EXIF orientation", after which
   * the tag is consumed and the pixels are upright.
   */
  pipeline = pipeline.rotate();
  /* Re-read: rotation may have swapped width and height. */
  const rotated = await pipeline.metadata();
  const srcW = rotated.width ?? meta.width;
  const srcH = rotated.height ?? meta.height;

  if (crop) {
    const box = pixelBox(crop, srcW, srcH);
    /*
     * A degenerate box — somebody's drag that never moved, or a crafted
     * request — is dropped rather than refused. Falling through to the
     * cover-resize below gives them a centred 4:3 of the whole photo, which is
     * what they would have got by not cropping at all.
     */
    if (box.width >= 16 && box.height >= 16) pipeline = pipeline.extract(box);
  }

  try {
    return await pipeline
      /*
       * `fit: "cover"` with `position: "centre"`, which matters for the
       * no-crop path: an uncropped 3:2 photograph is centre-cropped to 4:3
       * rather than squashed to it. `withoutEnlargement` is deliberately NOT
       * set — a small source is scaled up so that every stored image has the
       * same dimensions, and a grid of cards that are the same size except for
       * the two that came from small files is worse than a slightly soft card.
       */
      .resize(OUT_WIDTH, OUT_HEIGHT, { fit: "cover", position: "centre" })
      /*
       * Strip metadata by omission. `.withMetadata()` is not called, so EXIF
       * does not survive — which is a privacy property worth having on purpose
       * rather than by accident: a phone photograph carries the GPS coordinates
       * of the kitchen it was taken in, and these files are served publicly
       * from a CDN to every customer who opens the builder.
       *
       * Quality 82 with `effort: 5`: at 1024x768 that lands around 60-90KB for
       * a photograph, which is the difference between this and the 6MB original
       * that §12 is about.
       */
      .webp({ quality: 82, effort: 5 })
      .toBuffer();
  } catch {
    throw new ImageError("We couldn't process that photo. Try a different one.");
  }
}


/** True when a Blob store is wired up. Read before offering an upload control. */
export function hasImageStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export const NO_IMAGE_STORE_MESSAGE =
  "Photo uploads aren't set up on this deployment yet. Create a Blob store in "
  + "the Vercel dashboard (Storage → Create → Blob) and redeploy — everything "
  + "else on this page works without it.";

/**
 * Store the optimized bytes and hand back a URL.
 *
 * `addRandomSuffix: true`, which is the one Blob option worth explaining. The
 * path below is derived from the option — `catalog/filling/nutella.webp` — and
 * without a suffix a re-upload would overwrite the same key. That reads like a
 * feature ("replacing the photo replaces the file") and behaves like a bug,
 * because Blob URLs are served with a long immutable cache header: the new
 * bytes would sit behind a CDN entry for the old ones, and the owner who just
 * uploaded a photograph would be shown the previous one and reasonably conclude
 * the upload had failed. A random suffix makes every version its own immutable
 * URL, and the old one is deleted explicitly by the caller once the new URL is
 * committed to the database.
 *
 * The readable prefix survives anyway, which is worth keeping: somebody looking
 * at the store in the Vercel dashboard can tell what these files are.
 */
export async function store(bytes: Buffer, category: string, value: string): Promise<string> {
  /* Both halves come from the enums in lib/schema.ts by the time they reach
     here, but this is the string that becomes a URL path, so it is sanitised
     rather than assumed. */
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "item";

  const { url } = await put(`catalog/${slug(category)}/${slug(value)}.webp`, bytes, {
    access: "public",
    contentType: "image/webp",
    addRandomSuffix: true,
  });
  return url;
}

/**
 * Delete a stored photograph, and never fail the caller for it.
 *
 * Called after the database has already been updated — a replaced photo's old
 * URL, or a removed one's. By that point the operation the owner asked for has
 * succeeded, and the only thing left is housekeeping: telling them "the photo
 * was removed but the file wasn't deleted" gives them a problem they cannot act
 * on and no reason to care. An orphaned blob costs a fraction of a cent.
 *
 * The guard is not cosmetic. This is only ever handed a URL that was in the
 * database, and rows predating the Blob store could in principle hold something
 * else; `del` on a foreign URL is a request that should not be made.
 */
export async function discard(url: string | null | undefined): Promise<void> {
  if (!url || !url.includes(".blob.vercel-storage.com")) return;
  try {
    await del(url);
  } catch (e) {
    console.error("blob_delete_failed", url, e);
  }
}
