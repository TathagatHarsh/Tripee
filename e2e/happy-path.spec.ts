import { expect, test } from "@playwright/test";

/**
 * One happy path, end to end: a stranger arrives, builds a cake they imagined,
 * gets told why one of their choices is impossible, fixes it in a tap, and comes
 * away with a real order reference.
 */
test("a stranger can build a cake, be corrected, and get an order reference", async ({ page }) => {
  await page.goto("/");
  // The redesigned hero headline. Copy, not contract — the contract on this page
  // is the "Start building" call to action on the line below.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Custom cake");

  // The redesigned landing repeats this call to action three times — nav, hero
  // and the closing band. Any of them is the same destination; take the first.
  await page.getByRole("link", { name: "Start building" }).first().click();
  await expect(page).toHaveURL(/\/build\/shape$/);

  // The canvas mounts and the docket is already showing a price.
  await expect(page.locator("canvas")).toBeVisible();
  const docket = page.getByRole("complementary", { name: "Order docket" });
  await expect(docket).toContainText("TOTAL");

  // Shape
  await page.getByRole("radio", { name: /^Round/ }).click();
  await page.getByRole("link", { name: "Size & tiers →" }).click();

  // Size and tiers — two tiers on a 1kg cake is blocked, and says so.
  await page.getByRole("radio", { name: /^2 kg/ }).click();
  await page.getByRole("button", { name: /^2 tiers/ }).click();

  // Sponge
  await page.getByRole("link", { name: "Sponge →" }).click();
  await page.getByRole("radio", { name: /^Belgian Chocolate/ }).click();

  // Filling
  await page.getByRole("link", { name: "Filling →" }).click();
  await page.getByRole("radio", { name: /^Salted Caramel/ }).click();

  // Frosting — whipped cream cannot hold two tiers. Take the offered fix.
  await page.getByRole("link", { name: "Frosting →" }).click();
  await page.getByRole("radio", { name: /^Whipped Cream/ }).click();

  // Scoped to main: Next's own route announcer is also role="alert".
  const violations = page.getByRole("main").getByRole("alert");
  await expect(violations).toContainText("collapses under the weight");
  await page.getByRole("button", { name: "Use Swiss meringue instead" }).click();
  await expect(violations).toHaveCount(0);

  // Colour and finish
  await page.getByRole("link", { name: "Colour & finish →" }).click();
  await page.getByRole("button", { name: "Blush" }).click();

  // Toppings
  await page.getByRole("link", { name: "Toppings →" }).click();
  await page.getByRole("button", { name: /^Strawberry/ }).click();
  // The chosen topping's settings are on the render now, not in a list under the
  // picker — see builder/ToppingBar. The slider existing is the proof it landed.
  await expect(page.getByRole("slider", { name: "Strawberry density" })).toBeVisible();

  // Message
  await page.getByRole("link", { name: "Message →" }).click();
  await page.getByPlaceholder("Happy Birthday Amma").fill("Happy Birthday Amma");
  await page.getByPlaceholder("500081").fill("500081");

  // The docket picked all of it up.
  await expect(docket).toContainText("SWISS MERINGUE");
  await expect(docket).toContainText("HAPPY BIRTHDAY AMMA");

  // Review, and place the order.
  await page.getByRole("link", { name: "Review →" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(page.getByText("Confirmed against the kitchen's own pricing.")).toBeVisible();

  await page.getByLabel("Name").fill("Aryu");
  await page.getByLabel("Phone").fill("9876543210");

  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(
    page.getByRole("heading", { name: /^Order MC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/ }),
  ).toBeVisible();
});

test("undo puts back a choice the customer changed their mind about", async ({ page }) => {
  await page.goto("/build/sponge");
  await expect(page.locator("canvas")).toBeVisible();

  const docket = page.getByRole("complementary", { name: "Order docket" });
  await expect(docket).toContainText("VANILLA");

  await page.getByRole("radio", { name: /^Red Velvet/ }).click();
  await expect(docket).toContainText("RED VELVET");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(docket).toContainText("VANILLA");
});

test("a refresh does not lose the work", async ({ page }) => {
  await page.goto("/build/sponge");
  await page.getByRole("radio", { name: /^Pistachio/ }).click();

  const docket = page.getByRole("complementary", { name: "Order docket" });
  await expect(docket).toContainText("PISTACHIO");

  await page.reload();
  await expect(docket).toContainText("PISTACHIO");
});

test("a saved design comes back from its short link", async ({ page }) => {
  await page.goto("/build/review");
  await page.getByRole("button", { name: "Save & share" }).click();

  // The saved-design link, not the "carry it in the URL" one below it.
  const link = page.locator("a[href*='/d/']:not([href*='/d/new'])").first();
  await expect(link).toBeVisible();

  const href = await link.getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("button", { name: "Make this one mine" })).toBeVisible();
  await expect(page.getByText("TOTAL", { exact: true })).toBeVisible();
});

test("cutting a slice exposes the inside and leaves the price alone", async ({ page }) => {
  await page.goto("/build/filling");
  await expect(page.locator("canvas")).toBeVisible();

  const docket = page.getByRole("complementary", { name: "Order docket" });
  await page.getByRole("radio", { name: /^Salted Caramel/ }).click();
  await expect(docket).toContainText("SALTED CARAMEL");

  const before = await docket.textContent();

  // A cut is a way of looking at the cake, not a thing you order: the docket,
  // the price and the config must all be untouched by it.
  await page.getByRole("button", { name: "Cut a slice" }).click();
  await expect(page.getByRole("button", { name: "Whole cake" })).toBeVisible();
  expect(await docket.textContent()).toBe(before);

  await page.getByRole("button", { name: "Whole cake" }).click();
  await expect(page.getByRole("button", { name: "Cut a slice" })).toBeVisible();
});

test("the message plaque lifts while typing and settles when done", async ({ page }) => {
  await page.goto("/build/message");
  await expect(page.locator("canvas")).toBeVisible();

  await page.getByPlaceholder("Happy Birthday Amma").fill("Happy Birthday Amma");
  await expect(page.getByText("Held clear of the cake while you type")).toBeVisible();

  await page.getByRole("button", { name: /^Done/ }).click();
  await expect(page.getByText("Sitting on the cake")).toBeVisible();

  // Enter is the other way to say "done".
  await page.getByPlaceholder("Happy Birthday Amma").click();
  await expect(page.getByText("Held clear of the cake while you type")).toBeVisible();
  await page.getByPlaceholder("Happy Birthday Amma").press("Enter");
  await expect(page.getByText("Sitting on the cake")).toBeVisible();
});

/**
 * A preset has to land where the customer still has something to say.
 *
 * It used to open on Review, on the reasoning that a preset is a finished cake
 * and nobody should be walked back through nine settled decisions. True of six of
 * them — shape, size, sponge, filling, frosting, finish are what the preset *is*.
 * Not true of the last two: six of the eight presets carry no message, so opening
 * on the docket shipped a cake with nothing written on it and never asked whose
 * birthday it was.
 */
test("a preset opens where the customer still has a choice to make", async ({ page }) => {
  await page.goto("/presets");
  await page.getByRole("button", { name: "Make it mine" }).first().click();

  // Toppings, not Review: the first step the preset could not decide for anyone.
  await expect(page).toHaveURL(/\/build\/toppings$/);
  await expect(page.locator("canvas")).toBeVisible();

  // The preset's own choices came with it rather than being reset to a plain cake.
  const docket = page.getByRole("complementary", { name: "Order docket" });
  await expect(docket).toContainText("BELGIAN CHOCOLATE");

  // Its topping is already there and adjustable, which is the point of landing here.
  await expect(page.getByRole("slider", { name: /density$/ })).toBeVisible();

  // And the two questions that are actually the customer's are ahead of them,
  // each with its own button, rather than behind them in a nav they have no
  // reason to look at.
  await page.getByRole("link", { name: "Message →" }).click();
  await page.getByPlaceholder("Happy Birthday Amma").fill("Happy Birthday Ammu");

  await page.getByRole("link", { name: "Review →" }).click();
  await expect(docket).toContainText("HAPPY BIRTHDAY AMMU");
});
