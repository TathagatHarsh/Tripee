import { expect, type Page } from "@playwright/test";
export const MADHAPUR = { lat: 17.4486, lng: 78.3908, address: "Road No 36, Madhapur", locality: "Madhapur", city: "Hyderabad", state: "Telangana", pincode: "500081", placeId: "N1" };
export async function pinAddress(page: Page, place = MADHAPUR, covered = true) {
  await page.route("**/api/location", (route) => route.fulfill({ json: { results: [place] } }));
  await page.route("**/api/serviceability", (route) => route.fulfill({ json: { covered } }));
  await page.getByRole("button", { name: /Add delivery address|Change/ }).click();
  await page.getByLabel("Search for your area, street or building").fill("Madhapur");
  await page.getByRole("button", { name: place.address, exact: true }).click();
}
export async function deliveryDetails(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("E2E Guest Customer");
  await page.getByLabel(/^Phone/).fill("9876543210");
  await page
    .getByLabel("Email (optional)", { exact: true })
    .fill("guest@example.invalid");
  await pinAddress(page);
  await page.getByRole("button", { name: "Confirm location", exact: true }).click();
  await page
    .getByLabel("Flat / house no. and floor", { exact: true })
    .fill("12 Synthetic Test Street");
  await scheduleDelivery(page);
  await expect(page.getByText(/We deliver here/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Place order/ }),
  ).toBeEnabled();
}

/** Schedules delivery five days out in the 10:00–12:00 window. */
export async function scheduleDelivery(page: Page, days = 5) {
  await page.getByRole("radio", { name: /^Schedule/ }).check();
  await page.getByLabel("Delivery date").fill(new Date(Date.now() + days * 86400000).toISOString().slice(0, 10));
  await page.getByRole("radio", { name: "10:00–12:00" }).check({ force: true });
}
