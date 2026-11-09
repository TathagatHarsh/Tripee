const FILLING_PHOTOS = new Set([
  "/presets/strawberry-cream.webp",
  "/presets/american-blueberry.webp",
  "/presets/strawberry-cheesecake.webp",
  "/presets/blueberry-cheesecake.webp",
]);

/** Refresh cached preset photos without changing uploaded catalogue images. */
export function cakePhotoUrl(src: string): string {
  return FILLING_PHOTOS.has(src) ? `${src}?v=filling-1` : src;
}
