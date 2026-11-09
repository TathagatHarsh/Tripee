import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { cakePhotoUrl } from "../lib/cakePhotoUrl";

describe("updated fruit filling photos", () => {
  it("refreshes all four local images and keeps repeated resolution stable", () => {
    for (const slug of ["strawberry-cream", "american-blueberry", "strawberry-cheesecake", "blueberry-cheesecake"]) {
      const path = `/presets/${slug}.webp`;
      const url = cakePhotoUrl(path);
      expect(existsSync(`public${path}`)).toBe(true);
      expect(url).not.toBe(path);
      expect(cakePhotoUrl(url)).toBe(url);
    }
  });
  it("preserves other cakes and uploaded images", () => {
    for (const url of ["/presets/chocolate-truffle.webp", "https://example.com/strawberry-cream.webp"]) {
      expect(cakePhotoUrl(url)).toBe(url);
    }
  });
});
