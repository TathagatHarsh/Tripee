import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * WCAG 2.1 AA, checked rather than assumed. The plan's definition of done says
 * "the whole thing works with a keyboard" — this is the part of that claim a
 * machine can settle.
 */
const ROUTES = [
  ["/", "landing"],
  ["/presets", "presets"],
  ["/build/shape", "shape step"],
  ["/build/size", "size and tiers"],
  ["/build/frosting", "frosting step"],
  ["/build/finish", "colour and finish"],
  ["/build/toppings", "toppings step"],
  ["/build/message", "message step"],
  ["/build/review", "review"],
  ["/kitchen", "kitchen board"],
] as const;

/** Violations as lines a person can act on, rather than an object dump. */
async function violations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  return results.violations.map(v =>
    `${v.id} (${v.impact}) — ${v.help}\n    ${v.nodes.map(n => n.target.join(" ")).join("\n    ")}`,
  );
}

test.describe("accessibility", () => {
  for (const [route, name] of ROUTES) {
    test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForSelector("canvas, main");
      await page.waitForTimeout(1500);

      const summary = await violations(page);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }

  /*
   * The route above visits the toppings step with nothing chosen, so the one
   * control that lives on the render is never in the DOM when axe looks at it.
   * It is a swatch, two strips of pills and a slider over a translucent panel —
   * exactly the shape of thing that fails contrast — so it gets its own pass,
   * with two toppings chosen so the tab strip is in it as well.
   */
  test("the topping bar on the render has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/build/toppings");
    await page.waitForSelector("canvas");
    await page.getByRole("button", { name: /^Strawberry/ }).click();
    await page.getByRole("button", { name: /^Mixed Berry/ }).click();
    await expect(page.getByRole("slider", { name: "Mixed Berry density" })).toBeVisible();

    const summary = await violations(page);
    expect(summary, summary.join("\n")).toEqual([]);
  });

  test("the builder can be driven with the keyboard alone", async ({ page }) => {
    await page.goto("/build/shape");
    await page.waitForSelector("canvas");

    // The shape options are a radiogroup with a roving tabindex, so Tab reaches
    // the group once and the arrow keys move within it. That is the behaviour
    // a screen-reader user is taught to expect from a single-select group, and
    // it is what replaced eleven independently-tabbable toggle buttons.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(() => document.activeElement?.textContent ?? "");
      if (label.startsWith("Round")) break;
    }

    // Round → Square → Rectangle → Heart.
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");

    await expect(page.getByRole("radio", { name: /^Heart/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    const docket = page.getByRole("complementary", { name: "Order docket" });
    await expect(docket).toContainText("HEART");
  });
});
