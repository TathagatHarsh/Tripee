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
  /*
   * /kitchen used to be here and cannot be any more: it is behind a session
   * now, and an anonymous browser is redirected off it before it renders —
   * which is the point of e2e/auth.spec.ts. /sign-in takes its place and is the
   * better subject anyway: it is the one form in the product with labels, an
   * error region and social buttons, which is the exact shape of thing that
   * fails a contrast or a name check. It is Clerk's markup inside our sheet, so
   * this also checks that the `appearance` in components/AuthSheet has not
   * styled the contrast out of somebody else's component.
   */
  ["/sign-in", "sign in"],
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

  /*
   * Same hole as the topping bar, for the same reason: the account panel is a
   * [popover], so while it is closed it is `display:none` and axe walks straight
   * past it. The route pass above never clicks, so the panel has to be opened
   * here or it is never scanned at all.
   *
   * CI has no Clerk publishable key, so this exercises the guest rows — which is
   * the state every first-time visitor sees, and the one with two links in it.
   */
  test("the account panel has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Account" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    const summary = await violations(page);
    expect(summary, summary.join("\n")).toEqual([]);
  });

  test("the account menu opens, closes and stays inside the viewport", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Account" });
    const panel = page.getByRole("navigation", { name: "Account" });

    // The icon is the whole control, in both states, and it is a real target.
    const box = await trigger.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Shut, and saying so.
    await expect(panel).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Escape closes it, and `aria-expanded` follows — the attribute is mirrored
    // from the popover's own toggle event, not set by the click handler, which
    // is the only way it survives a dismissal the button never hears about.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    // A click anywhere else closes it too.
    await trigger.click();
    await expect(panel).toBeVisible();
    await page.locator("h1").first().click();
    await expect(panel).toBeHidden();

    // Tab from the trigger lands in the panel: the popover sits immediately
    // after the button in the DOM, so the platform's own tab order is the
    // keyboard support and there is no roving tabindex to get wrong.
    await trigger.focus();
    await trigger.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeFocused();

    // And selecting a row closes it and goes there.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  /*
   * The reason this change exists. 320px is the narrowest phone still in the
   * wild; the panel is `w-[min(17rem,calc(100vw-2rem))]`, so the viewport is one
   * side of the min() and it cannot be the overflowing one.
   */
  for (const [width, height, name] of [
    [1440, 900, "desktop"],
    [1024, 768, "laptop"],
    [768, 1024, "tablet"],
    [390, 844, "mobile"],
    [320, 568, "small mobile"],
  ] as const) {
    test(`the account panel fits a ${name} viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.getByRole("button", { name: "Account" }).click();

      const panel = page.getByRole("navigation", { name: "Account" });
      await expect(panel).toBeVisible();

      const box = await panel.boundingBox();
      expect(box, "panel is laid out").not.toBeNull();
      expect(box!.x, "not off the left edge").toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, "not off the right edge").toBeLessThanOrEqual(width);
      expect(box!.y, "not above the fold").toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, "not off the bottom").toBeLessThanOrEqual(height);

      // And the page itself did not grow a horizontal scrollbar because of it.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
    });
  }

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
