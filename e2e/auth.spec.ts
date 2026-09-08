import { expect, test } from "@playwright/test";

/**
 * The doors, from outside.
 *
 * The whole guest/customer/kitchen/admin matrix is settled in tests/auth.test.ts
 * against pure functions, where it can be exhaustive and costs nothing. What a
 * unit test cannot prove is that those rules are actually *wired into* the
 * routes — that the layout calls the guard, that the proxy matcher still covers
 * the path, that nothing renders before the redirect. That is this file, and it
 * is deliberately only the anonymous half: it needs no fixture, no seeded staff
 * account and no live Clerk instance, so it runs in CI on every push.
 */

for (const [path, what] of [
  ["/admin", "admin portal"],
  ["/admin/catalog", "catalogue editor"],
  ["/admin/orders", "order book"],
  ["/kitchen", "kitchen board"],
  ["/account", "account page"],
] as const) {
  test(`a stranger cannot open the ${what}`, async ({ page }) => {
    const response = await page.goto(path);
    const status = response?.status() ?? 0;

    /*
     * Two refusals are correct here, and which one you get depends on whether
     * the deployment has a Clerk instance:
     *
     *   - configured   → 2xx at /sign-in, because they can do something about it;
     *   - unconfigured → 503, the fail-closed answer proxy.ts gives when there
     *                    is no identity provider to ask.
     *
     * Asserting only the first would make this suite pass on a machine with
     * keys and fail on one without, which is a test about configuration rather
     * than about the door. The property being checked is that neither one is
     * the page.
     */
    const redirected = /\/sign-in(\?|\/|$)/.test(page.url());
    expect(redirected || status === 503, `refused (url=${page.url()} status=${status})`).toBe(true);
    expect(status, "never a server error").not.toBe(500);

    // And nothing from behind the door leaked into what was served.
    await expect(page.locator("body")).not.toContainText("Kitchen board →");
    await expect(page.locator("body")).not.toContainText("Awaiting our call");
  });
}

test("the builder and a guest order are untouched by any of this", async ({ page }) => {
  // The one regression that would matter most: authentication must not have
  // put a wall in front of the thing this bakery sells.
  await page.goto("/build/shape");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page).toHaveURL(/\/build\/shape$/);

  // No sign-in prompt anywhere in the builder chrome.
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
});

test("the sign-in page is ours around Clerk's, and does not demand an account", async ({ page }) => {
  await page.goto("/sign-in");

  // The chrome is this bakery's: letterhead, and the line that matters most on
  // this page — that none of it is required to buy a cake.
  await expect(page.getByRole("link", { name: "Makemycake" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("don't need an account");
  await expect(page.getByRole("link", { name: "Start building" })).toBeVisible();

  // The page names itself, in both states.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");

  /*
   * And then either Clerk's form, or the notice explaining there is no instance
   * to sign in to. `toBeVisible` rather than a synchronous count, because Clerk
   * mounts after hydration and a count taken on load is always zero.
   *
   * Deliberately loose about what is inside: which fields and which social
   * buttons appear is configured in the Clerk dashboard, not in this
   * repository, so pinning them here would turn somebody enabling a second
   * factor into a CI failure.
   */
  await expect(
    page.locator(".cl-rootBox, .auth-sheet p").first(),
  ).toBeVisible();
});
