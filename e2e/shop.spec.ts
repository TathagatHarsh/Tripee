import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function configuredBasket(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A little more celebration.",
  );
  await page
    .getByRole("button", { name: /Add to cart , Pineapple Delight/ })
    .click();
  await page.getByRole("radio", { name: /^0\.5 kg/ }).click();
  await page.getByRole("radio", { name: /^Eggless/ }).click();
  await page
    .getByLabel("Message on the cake (optional)")
    .fill("Happy Birthday Amma");
  await page.getByRole("button", { name: "One more", exact: true }).click();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.goto("/cart");
  await expect(
    page.getByRole("link", { name: "Cart, 2 cakes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Message on the cake (optional)")).toHaveValue(
    "Happy Birthday Amma",
  );
  await page.getByRole("button", { name: "One fewer", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("link", { name: "Cart, 1 cake", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Checkout", exact: true }).click();
}
/**
 * Pins a Madhapur address through the location sheet. The two lookups are
 * stubbed so the suite does not depend on the public Photon instance; placing
 * the order still needs a bakery covering this pin in the scratch database
 * (the orders route checks coverage itself).
 */
const MADHAPUR = { lat: 17.4486, lng: 78.3908, address: "Road No 36, Madhapur", locality: "Madhapur", city: "Hyderabad", state: "Telangana", pincode: "500081", placeId: "N1" };
async function pinAddress(page: Page, place = MADHAPUR, covered = true) {
  await page.route("**/api/location", (route) => route.fulfill({ json: { results: [place] } }));
  await page.route("**/api/serviceability", (route) => route.fulfill({ json: { covered } }));
  await page.getByRole("button", { name: /Add delivery address|Change/ }).click();
  await page.getByLabel("Search for your area, street or building").fill("Madhapur");
  await page.getByRole("button", { name: place.address, exact: true }).click();
}
async function deliveryDetails(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("E2E Guest Customer");
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page
    .getByLabel("Email (optional)", { exact: true })
    .fill("guest@example.invalid");
  await pinAddress(page);
  await page.getByRole("button", { name: "Confirm location", exact: true }).click();
  await page
    .getByLabel("Flat / house no. and floor", { exact: true })
    .fill("12 Synthetic Test Street");
  await page
    .getByLabel("Requested date")
    .fill(new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10));
  await expect(page.getByText(/We deliver here/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Place order/ }),
  ).toBeEnabled();
}

test("guest can configure, edit, confirm delivery, order, refresh receipt and track", async ({
  page,
  browser,
}) => {
  await configuredBasket(page);
  await deliveryDetails(page);
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "E2E Guest Customer",
  );
  await expect(page.getByLabel("Flat / house no. and floor", { exact: true })).toHaveValue(
    "12 Synthetic Test Street",
  );
  await expect(page.getByText(/We deliver here/)).toBeVisible();
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    a11y.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`,
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(
    page.getByRole("heading", { name: "Order Confirmed!" }),
  ).toBeVisible();
  const confirmation = await page.getByText(/^Order #MC-/).textContent();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Order Confirmed!" }),
  ).toBeVisible();
  await expect(page.getByText(confirmation!, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Track/ }).click();
  await expect(page).toHaveURL(/\/orders\/MC-/);
  await expect(page.getByRole("main")).toContainText("12 Synthetic Test Street");
  const outsider = await browser.newContext();
  const denied = await outsider.request.get(page.url());
  expect([404, 503].includes(denied.status()) || /\/sign-in/.test(denied.url())).toBe(true);
  expect(await denied.text()).not.toContain("E2E Guest Customer");
  await outsider.addCookies([{ name: "mmc_orders", value: "forged.invalid", url: new URL(page.url()).origin }]);
  const forgedPage = await outsider.newPage();
  await forgedPage.goto(page.url());
  // App Router may deliver a streaming redirect in a 200 response. Check the
  // resulting browser destination and absence of private content, not status alone.
  await expect(forgedPage).toHaveURL(/\/sign-in/);
  await expect(forgedPage.locator("body")).not.toContainText("12 Synthetic Test Street");
  await outsider.close();
});

test("mobile checkout blocks an unserviceable address and preserves details after network failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await configuredBasket(page);
  await deliveryDetails(page);
  // A pin no bakery reaches is refused on the map, with pickup offered.
  await page.unroute("**/api/location");
  await page.unroute("**/api/serviceability");
  await pinAddress(page, { ...MADHAPUR, address: "Connaught Place", pincode: "110001" }, false);
  await expect(page.getByText("We don't deliver here yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm location", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  // A hand-edited pincode outside the zones is refused by the slot rules.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Pincode", { exact: true }).fill("110001");
  await expect(page.getByText(/Not serviceable/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Place order/ }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Pincode", { exact: true }).fill("500081");
  await expect(page.getByText(/We deliver here/)).toBeVisible();
  await page.route("**/api/orders", (route) => route.abort());
  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(page.getByText(/We couldn't confirm the result/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Cart, 1 cake", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "E2E Guest Customer",
  );
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(size.document).toBeLessThanOrEqual(size.viewport);
});

test("Leaflet pin survives completing the address and reaches server assignment", async ({ page }, testInfo) => {
  await configuredBasket(page);
  await page.getByLabel("Name", { exact: true }).fill("Assignment Demo Customer");
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await pinAddress(page);
  const map = page.getByRole("region", { name: "Move the map to put the pin on your door" });
  await expect(map.locator(".leaflet-map-pane")).toBeVisible();
  await map.screenshot({ path: testInfo.outputPath("leaflet-checkout.png") });
  await page.getByRole("button", { name: "Confirm location", exact: true }).click();
  await page.getByLabel("Flat / house no. and floor", { exact: true }).fill("House 12");
  await page.getByLabel("Requested date").fill(new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10));
  const created = page.waitForResponse(r => r.url().endsWith("/api/orders") && r.request().method() === "POST");
  await page.getByRole("button", { name: /^Place order/ }).click();
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  const body = response.request().postDataJSON();
  expect(body.fulfillment.location.lat).toBeGreaterThan(17);
  expect(body.fulfillment.location.lng).toBeGreaterThan(78);
  await expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible();
});

test("assignment, earnings and worker APIs reject anonymous or cross-site requests", async ({ request }) => {
  expect((await request.get("/api/assignments/MC-UNKNOWN")).status()).toBe(403);
  expect((await request.get("/api/vendor/earnings")).status()).toBe(403);
  expect((await request.get("/api/orders/MC-UNKNOWN/assignment")).status()).toBe(404);
  expect((await request.post("/api/internal/assignments")).status()).toBe(401);
  expect((await request.post("/api/assignments/MC-UNKNOWN", { headers: { origin: "https://unrelated.invalid" }, data: { action: "start" } })).status()).toBe(403);
});
