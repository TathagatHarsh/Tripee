/**
 * What a catalogue photograph has to be, said in a file the browser can read.
 *
 * These four values are needed on both sides of the boundary and that is the
 * whole reason this file exists. The cropper in components/admin/ImageUploader
 * has to draw the same aspect ratio the server will crop to, and its file
 * picker has to offer the same formats the server will decode — if either pair
 * drifts, the failure is an upload that is refused after the person waited for
 * it, or a crop box that frames something other than what gets stored.
 *
 * They used to live in lib/storage.ts, which was the obvious place and broke
 * the build. That module imports `sharp` and `@vercel/blob`, so a client
 * component reaching in for a number pulled `sharp` — and therefore
 * `detect-libc`, `child_process` and `fs` — into the browser bundle. Its
 * `import "server-only"` should have caught that and did not: the marker fails
 * a *server-only* module imported into a client one, and the resolver had
 * already followed the transitive requires by the time it mattered.
 *
 * So the constants moved here and lib/storage re-exports them, which means
 * there is still exactly one definition of each and server callers do not need
 * to know this split happened. This file imports nothing, deliberately — the
 * moment it imports something with a Node dependency it becomes lib/storage
 * again.
 */

/**
 * 4:3, landscape.
 *
 * One ratio for the whole catalogue, which is what §11 asks for and what makes
 * a grid of options look like a grid rather than a collage. 4:3 rather than
 * square: a cake is wider than it is tall once it is on a board, and the preset
 * photographs already in /public/presets are landscape, so a square crop would
 * make the two sets of imagery disagree on the one page that shows both.
 */
export const IMAGE_ASPECT = 4 / 3;

/**
 * What the file picker accepts and what the server will decode.
 *
 * The four the brief names. Notably absent: SVG, which sharp can read and which
 * is a script-execution vector when served from a URL — and AVIF, which is
 * absent only because nothing needs it as an *input*.
 *
 * This list is advisory on the client (an `accept` attribute is a hint a file
 * dialog respects and a crafted request ignores) and a fast rejection on the
 * server. The real check is that sharp decodes the bytes as a raster image of a
 * known format — see `optimize` in lib/storage.
 */
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp";

/**
 * 8MB.
 *
 * Generous enough for any phone photograph and small enough that a request
 * cannot be used to make the server allocate arbitrary memory. Checked on the
 * client so somebody gets an instant answer instead of an 8MB round trip, and
 * again on the server because that is the one that counts.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * A crop box, in fractions of the source image.
 *
 * Fractions rather than pixels, so the client does not have to know the decoded
 * dimensions and a value that was computed against a preview can be applied to
 * the original. Every field is clamped and the box is re-derived from the real
 * dimensions below, because these four numbers come off a request.
 */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A fractional crop turned into a pixel box that is provably inside the image.
 *
 * Every value here came off a request, so none of it is trusted: fractions are
 * clamped to [0,1], the origin is clamped so the box cannot start past the
 * edge, and the size is clamped to what is left. `sharp.extract` throws on a
 * box that leaves the image, and the failure mode of getting this wrong is an
 * upload that always fails for one photograph and works for the next.
 *
 * NaN is handled by the clamp rather than by a separate check: `Math.max(0, NaN)`
 * is NaN, so the `|| 0` after it is what turns a missing or non-numeric field
 * into the top-left corner.
 *
 * ## Why this lives here rather than beside the sharp call that uses it
 *
 * It is pure arithmetic and it is the one piece of the upload path worth
 * pinning down with a test — everything else in lib/storage is a call into
 * sharp or into Blob, and this is the part that decides whether those calls are
 * handed a box inside the image or one that makes `extract` throw. lib/storage
 * opens with `import "server-only"`, which a test file cannot import, so the
 * function that most needs a test was the one function that could not have one.
 * Here it can. See tests/crop.test.ts.
 */
export function pixelBox(crop: Crop, srcW: number, srcH: number) {
  const frac = (n: number) => Math.min(1, Math.max(0, Number(n))) || 0;

  /*
   * The origin is clamped to `size - 1`, not to `size`.
   *
   * That one pixel is load-bearing and the reason is subtle enough that
   * tests/crop.test.ts exists to hold it: with a fraction of exactly 1 — which
   * `frac` produces from any value at or above 1, and therefore from
   * `Infinity` — `left` would land on `srcW`, leaving `srcW - left === 0` of
   * room. The `Math.max(1, …)` floor below would then widen the box back to a
   * single pixel *starting past the last one*, and `sharp.extract` would be
   * handed a region one pixel outside the image and throw.
   *
   * Clamping here guarantees at least one pixel of room, which is exactly what
   * the floor below needs to be safe.
   */
  const left = Math.min(srcW - 1, Math.round(frac(crop.x) * srcW));
  const top = Math.min(srcH - 1, Math.round(frac(crop.y) * srcH));
  /* At least one pixel, so a zero-size box is caught by the caller's 16px
     floor rather than by sharp throwing. */
  const width = Math.max(1, Math.min(srcW - left, Math.round(frac(crop.width) * srcW)));
  const height = Math.max(1, Math.min(srcH - top, Math.round(frac(crop.height) * srcH)));

  return { left, top, width, height };
}
