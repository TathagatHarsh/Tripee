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
async function deliveryDetails(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("E2E Guest Customer");
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page
    .getByLabel("Email (optional)", { exact: true })
    .fill("guest@example.invalid");
  await page
    .getByLabel("Address line 1", { exact: true })
    .fill("12 Synthetic Test Street");
  await page.getByLabel("Pincode", { exact: true }).fill("500081");
  await page
    .getByLabel("Requested date")
    .fill(new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Confirm this address" }).click();
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
  await expect(page.getByLabel("Address line 1", { exact: true })).toHaveValue(
    "12 Synthetic Test Street",
  );
  await page.getByRole("button", { name: "Confirm this address" }).click();
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
    page.getByRole("heading", { name: "Your order is with us." }),
  ).toBeVisible();
  const confirmation = await page.getByText(/^Order MC-/).textContent();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your order is with us." }),
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
  await page.getByLabel("Pincode", { exact: true }).fill("110001");
  await expect(page.getByText(/Not serviceable/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Place order/ }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Pincode", { exact: true }).fill("500081");
  await expect(page.getByRole("button", { name: "✓ Address confirmed" })).toBeVisible();
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
