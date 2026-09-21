import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { BUILDER_ENABLED, BUILDER_HELD } from "./flags";

/**
 * WCAG 2.1 AA, checked rather than assumed. The plan's definition of done says
 * "the whole thing works with a keyboard" — this is the part of that claim a
 * machine can settle.
 */
/*
 * The storefront, which is the product a customer meets now.
 *
 * `/presets` is gone from this list because it is a redirect to `/shop`, and
 * the nine builder steps are gone because every one of them answers with the
 * Coming Soon page while the feature is held back — nine scans of the same
 * page. They come back, as themselves, in BUILDER_ROUTES below, the moment
 * NEXT_PUBLIC_BUILDER_ENABLED is set.
 *
 * /kitchen used to be here and cannot be any more: it is behind a session now,
 * and an anonymous browser is redirected off it before it renders — which is
 * the point of e2e/auth.spec.ts. /sign-in takes its place and is the better
 * subject anyway: it is the one form in the product with labels, an error
 * region and social buttons, which is the exact shape of thing that fails a
 * contrast or a name check. It is Clerk's markup inside our sheet, so this also
 * checks that the `appearance` in components/AuthSheet has not styled the
 * contrast out of somebody else's component.
 */
const ROUTES = [
  ["/", "shop front"],
  ["/shop", "collection"],
  ["/shop?category=chocolate", "a filtered collection"],
  ["/shop?q=nothingmatchesthis", "the empty collection"],
  ["/cakes/pineapple-delight", "a cake"],
  ["/cart", "the empty cart"],
  ["/checkout", "the empty checkout"],
  ["/build/shape", "the builder's coming-soon page"],
  ["/sign-in", "sign in"],
  /*
   * Both halves of the door now, not just the first.
   *
   * They share a shell and they do not share a form: sign-up carries a password
   * field, its own strength messaging and a different footer, and all three are
   * exactly the shape of thing that fails a label or a contrast check. One scan
   * of sign-in used to stand for both because the two pages were the same
   * component with a different string; they are still one component, but the
   * markup Clerk puts inside it is not the same markup.
   */
  ["/sign-up", "create an account"],
] as const;

/** The builder's own steps, scanned only when the builder is switched on. */
const BUILDER_ROUTES = [
  ["/build/shape", "shape step"],
  ["/build/size", "size and tiers"],
  ["/build/frosting", "frosting step"],
  ["/build/finish", "colour and finish"],
  ["/build/toppings", "toppings step"],
  ["/build/message", "message step"],
  ["/build/review", "review"],
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

  for (const [route, name] of BUILDER_ROUTES) {
    test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
      test.skip(!BUILDER_ENABLED, BUILDER_HELD);
      await page.goto(route);
      await page.waitForSelector("canvas, main");
      await page.waitForTimeout(1500);

      const summary = await violations(page);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }

  /*
   * The confirmation, which the route sweep can never reach: it is a branch of
   * the checkout form's own state rather than a URL, so the only way to put it
   * in front of axe is to buy a cake.
   *
   * Worth the six seconds. It is the one screen in the shop built around an
   * animation, it moves focus to a heading the customer never clicked, and it
   * navigates on a timer — three of the four things on this page that can fail
   * somebody using it without sight or without a mouse.
   *
   * The keypress is what stops the timer: see components/shop/OrderPlaced.
   * Without it the confirmation replaces itself with the tracking page halfway
   * through the scan, and axe reports on whichever one it happened to catch.
   */
  /**
   * The variant sheet, which is the one modal a customer meets.
   *
   * Scanned open rather than closed, because closed it is not in the DOM at all
   * — see components/shop/AddToCartSheet, which mounts the `<dialog>` only while
   * it is showing. What this is actually checking is the pair of radio groups
   * inside it: `role="radiogroup"` with `role="radio"` children is a pattern axe
   * has opinions about, and getting the labelling wrong is invisible by eye.
   */
  test("the variant sheet has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("button", { name: /^Add to cart/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    /* A size has to be chosen before the sponge group exists, so the scan
       covers both groups rather than one and a sentence. */
    const choices = page.getByRole("dialog").getByRole("radio");
    if (await choices.count()) await choices.first().click();
    await page.waitForTimeout(400);

    const summary = await violations(page);
    expect(summary, `axe found:\n  ${summary.join("\n  ")}`).toEqual([]);
  });

  test("the order confirmation has no WCAG A/AA violations", async ({ page }) => {
    await page.goto("/cakes/pineapple-delight");
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await page.goto("/checkout");
    await page.getByLabel("Name", { exact: true }).fill("E2E Accessibility Guest");
    await page.getByLabel("Phone", { exact: true }).fill("9876543210");
    await page.getByRole("radio", { name: /^pickup$/i }).check();
    await expect(page.getByText(/Pickup available/)).toBeVisible();
    await page.getByRole("button", { name: /^Place order/ }).click();
    const heading = page.getByRole("heading", { name: "Your order is with us." });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    const summary = await violations(page);
    expect(summary, summary.join("\n")).toEqual([]);
  });

  /*
   * The route above visits the toppings step with nothing chosen, so the one
   * control that lives on the render is never in the DOM when axe looks at it.
   * It is a swatch, two strips of pills and a slider over a translucent panel —
   * exactly the shape of thing that fails contrast — so it gets its own pass,
   * with two toppings chosen so the tab strip is in it as well.
   */
  test("the topping bar on the render has no WCAG A/AA violations", async ({ page }) => {
    test.skip(!BUILDER_ENABLED, BUILDER_HELD);
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
    /* Scoped to the panel: the storefront footer has its own "Sign in" link
       now, so an unscoped query names two controls. */
    await expect(
      page.getByRole("navigation", { name: "Account", exact: true })
        .getByRole("link", { name: "Sign in" }),
    ).toBeVisible();

    const summary = await violations(page);
    expect(summary, summary.join("\n")).toEqual([]);
  });

  test("the account menu opens, closes and stays inside the viewport", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Account" });
    const panel = page.getByRole("navigation", { name: "Account", exact: true });

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
    /*
     * Wait for a row to exist before tabbing, which matters on a deployment
     * that *has* a Clerk instance.
     *
     * With no publishable key — which is CI, and what this test was written
     * against — <Guest> renders synchronously and the two links are there in
     * the same frame the popover opens. With a key, <Session> renders
     * "Checking…" until Clerk resolves the session, and a panel whose only
     * child is a paragraph has nothing focusable in it: Tab walks straight past
     * the popover to the next control in the header and the assertion below
     * fails for a reason that has nothing to do with tab order.
     *
     * The property being tested is *where Tab goes*, not how fast Clerk is.
     */
    await expect(panel.getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.keyboard.press("Tab");
    /* Scoped for the same reason: the footer's own "Sign in" is the second
       match, and the point of the assertion is *which* one Tab reached. */
    await expect(panel.getByRole("link", { name: "Sign in" })).toBeFocused();

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

      const panel = page.getByRole("navigation", { name: "Account", exact: true });
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
    test.skip(!BUILDER_ENABLED, BUILDER_HELD);
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
