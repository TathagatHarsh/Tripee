import { expect, test } from "@playwright/test";

/**
 * Pixel baselines for the render.
 *
 * Every render bug in this project so far was found by a person looking at a
 * PNG — an inside-out lathe, the mirrored plaque, the drip ring hovering off
 * a heart. None of them would have survived a diff. This is that diff.
 *
 * It only works because the cake is deterministic: scatter, drips and layer
 * jitter are all seeded from a hash of the config, so the same config renders
 * the same pixels every time.
 */

/** Give the environment cubemap, the camera easing and the plaque time to settle. */
async function settle(page: import("@playwright/test").Page) {
  await page.waitForSelector("canvas");
  await page.waitForTimeout(6000);
}

test.describe("render baselines", () => {
  test("the extremes, whole", async ({ page }) => {
    await page.goto("/lab");
    await settle(page);
    await expect(page).toHaveScreenshot("lab-whole.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("the extremes, cut", async ({ page }) => {
    await page.goto("/lab");
    await page.waitForSelector("canvas");
    await page.getByLabel("Cut a slice").check();
    await settle(page);
    await expect(page).toHaveScreenshot("lab-cut.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("the builder, with the docket", async ({ page }) => {
    await page.goto("/build/frosting");
    await settle(page);
    await expect(page).toHaveScreenshot("builder.png", { maxDiffPixelRatio: 0.02 });
  });

  test("the plaque hovers while the message is being typed", async ({ page }) => {
    await page.goto("/build/message");
    await page.waitForSelector("canvas");
    await page.getByPlaceholder("Happy Birthday Amma").fill("Happy Birthday Amma");
    await settle(page);
    await expect(page).toHaveScreenshot("message-composing.png", { maxDiffPixelRatio: 0.02 });
  });

  test("the plaque settles onto the cake when it is done", async ({ page }) => {
    await page.goto("/build/message");
    await page.waitForSelector("canvas");
    await page.getByPlaceholder("Happy Birthday Amma").fill("Happy Birthday Amma");
    await page.getByRole("button", { name: /^Done/ }).click();
    await settle(page);
    await expect(page).toHaveScreenshot("message-placed.png", { maxDiffPixelRatio: 0.02 });
  });

  test("the landing hero", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page).toHaveScreenshot("landing.png", { maxDiffPixelRatio: 0.02 });
  });
});

/**
 * Below lg the stage is short and wide — 32dvh of a phone, against a canvas
 * that is the full width. Nothing covered that until the framing was found to
 * be solving the fit for a flat cake seen head-on: it forgot the rig looks
 * *down*, so height alone under-read the room the cake needs and the cake grew
 * out of the top and bottom of the frame. The desktop baselines could not catch
 * it because a tall stage is bound by width, where the fit was already right.
 */
test.describe("render baselines below lg", () => {
  test.use({ viewport: { width: 430, height: 900 } });

  test("the builder on a phone", async ({ page }) => {
    await page.goto("/build/frosting");
    await settle(page);
    await expect(page).toHaveScreenshot("builder-phone.png", { maxDiffPixelRatio: 0.02 });
  });
});
