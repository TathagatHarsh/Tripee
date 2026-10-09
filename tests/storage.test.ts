import { expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import { optimize } from "@/lib/storage";

it.each([6, 8])("crops the displayed portrait JPEG with EXIF orientation %i", async (orientation) => {
  // Rotating these side-by-side colours produces a portrait with two bands.
  const green = await sharp({ create: { width: 120, height: 160, channels: 3, background: "#00ff00" } })
    .png().toBuffer();
  const photo = await sharp({ create: { width: 240, height: 160, channels: 3, background: "#ff0000" } })
    .composite([{ input: green, left: 120, top: 0 }])
    .jpeg().withMetadata({ orientation }).toBuffer();

  // The top half of the displayed 160x240 image is a 160x120 crop.
  const output = await optimize(photo, { x: 0, y: 0, width: 1, height: 0.5 });
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  expect(info).toMatchObject({ width: 1024, height: 768, channels: 3 });
  const middle = ((384 * info.width) + 512) * info.channels;
  const red = data[middle];
  const greenValue = data[middle + 1];
  expect(orientation === 6 ? red : greenValue).toBeGreaterThan(240);
  expect(orientation === 6 ? greenValue : red).toBeLessThan(15);
});
