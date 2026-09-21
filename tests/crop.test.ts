import { describe, expect, it } from "vitest";
import { pixelBox } from "@/lib/imageSpec";

/**
 * The crop box, which is the one place in the upload path where four numbers
 * off a request become arguments to something that throws.
 *
 * `sharp.extract` rejects a region that leaves the image, and the failure mode
 * of getting this wrong is not a crash in a test — it is an upload that fails
 * for one particular photograph, in production, for reasons nobody can
 * reproduce from the error. So the clamping is checked directly rather than
 * inferred from the uploader working.
 *
 * The invariant every case below is really asserting is the same one:
 *
 *     left >= 0 && top >= 0 && left + width <= srcW && top + height <= srcH
 *
 * `inside` states it once so each test can say what it is about instead of
 * repeating four comparisons.
 */
function inside(
  box: { left: number; top: number; width: number; height: number },
  srcW: number,
  srcH: number,
): boolean {
  return (
    Number.isInteger(box.left) && Number.isInteger(box.top)
    && Number.isInteger(box.width) && Number.isInteger(box.height)
    && box.left >= 0 && box.top >= 0
    && box.width >= 1 && box.height >= 1
    && box.left + box.width <= srcW
    && box.top + box.height <= srcH
  );
}

describe("pixelBox", () => {
  it("maps an honest crop to the pixels it describes", () => {
    // The middle half of a 1000x800 image.
    const box = pixelBox({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 1000, 800);
    expect(box).toEqual({ left: 250, top: 200, width: 500, height: 400 });
  });

  it("keeps the whole image when asked for the whole image", () => {
    const box = pixelBox({ x: 0, y: 0, width: 1, height: 1 }, 4032, 3024);
    expect(box).toEqual({ left: 0, top: 0, width: 4032, height: 3024 });
    expect(inside(box, 4032, 3024)).toBe(true);
  });

  it("clamps a box that runs off the right and bottom edges", () => {
    // Starts at 90% and asks for another 50% — half of it is outside.
    const box = pixelBox({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, 1000, 1000);
    expect(inside(box, 1000, 1000)).toBe(true);
    expect(box.left + box.width).toBe(1000);
    expect(box.top + box.height).toBe(1000);
  });

  it("clamps a negative origin to the top-left corner", () => {
    const box = pixelBox({ x: -0.5, y: -2, width: 0.5, height: 0.5 }, 1000, 1000);
    expect(box.left).toBe(0);
    expect(box.top).toBe(0);
    expect(inside(box, 1000, 1000)).toBe(true);
  });

  it("clamps fractions above one", () => {
    const box = pixelBox({ x: 5, y: 5, width: 99, height: 99 }, 640, 480);
    expect(inside(box, 640, 480)).toBe(true);
  });

  /*
   * The four cases a crafted or broken request actually produces. Each one used
   * to be capable of reaching `sharp.extract` as a NaN, and NaN comparisons are
   * all false — so every guard written as `if (x > srcW)` would have let them
   * through.
   */
  it.each([
    ["NaN", { x: NaN, y: NaN, width: NaN, height: NaN }],
    ["Infinity", { x: Infinity, y: Infinity, width: Infinity, height: Infinity }],
    ["-Infinity", { x: -Infinity, y: -Infinity, width: -Infinity, height: -Infinity }],
    ["zero-size", { x: 0.5, y: 0.5, width: 0, height: 0 }],
  ])("survives a %s crop with a box inside the image", (_label, crop) => {
    const box = pixelBox(crop, 1000, 800);
    expect(inside(box, 1000, 800)).toBe(true);
  });

  it("never returns a zero-width box, so extract cannot be handed one", () => {
    // A degenerate drag: the caller drops boxes under 16px, but this must still
    // hand back something valid rather than a width of 0.
    const box = pixelBox({ x: 0.999, y: 0.999, width: 0.0001, height: 0.0001 }, 1000, 1000);
    expect(box.width).toBeGreaterThanOrEqual(1);
    expect(box.height).toBeGreaterThanOrEqual(1);
    expect(inside(box, 1000, 1000)).toBe(true);
  });

  it("holds for a spread of random crops against a portrait source", () => {
    // A property check rather than more examples: whatever four numbers arrive,
    // the box is inside the image.
    for (let i = 0; i < 300; i++) {
      const crop = {
        x: Math.random() * 3 - 1,
        y: Math.random() * 3 - 1,
        width: Math.random() * 3 - 1,
        height: Math.random() * 3 - 1,
      };
      expect(inside(pixelBox(crop, 3024, 4032), 3024, 4032)).toBe(true);
    }
  });
});
