import { expect, test } from "@playwright/test";
import { BUILDER_ENABLED } from "./flags";

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
  /*
   * Both nested order routes, with a reference that need not exist: the layout's
   * requireAdmin() refuses before anything queries an order, so what is being
   * asserted is that depth does not dilute the gate — the docket carries a
   * customer's name, phone and pincode onto a printable page, and "it is a
   * child route of a guarded one" is only true until somebody restructures it.
   */
  ["/admin/orders/MC-0000", "order detail"],
  ["/admin/orders/MC-0000/print", "printable docket"],
  /*
   * The delivery board, and again with its filters on. It lists every customer
   * due today with their name, phone number and pincode beside the bakery making
   * their cake, which is the densest page of customer data in the portal — and it
   * reads its whole scope out of the query string, so the second URL asserts that
   * a parameter cannot walk around the layout's requireAdmin().
   */
  ["/admin/orders/today", "delivery board"],
  ["/admin/orders/today?day=past&state=delivered", "filtered delivery board"],
  ["/kitchen", "kitchen board"],
  ["/account", "account page"],
  ["/account/profile", "profile and security page"],
  /*
   * The customer's own two order routes, with a reference that need not exist.
   * Depth does not dilute the gate here either: a tracking page carries the
   * customer's name, phone number and delivery area, and the page refuses before
   * it queries anything. The detail route also proves the guard runs ahead of
   * the `userId` filter in app/orders/data.ts rather than instead of it.
   */
  ["/orders", "orders page"],
  ["/orders/MC-0000", "order tracking page"],
  /*
   * The partner bakeries' portal, and its order detail with a reference that
   * need not exist. The layout's `requireVendor()` refuses before anything
   * queries an assignment, so what is asserted here is that depth does not
   * dilute the gate: a vendor order page carries a customer's name, their
   * delivery window and the whole cake specification.
   *
   * What this cannot reach is the half of that guard which matters most — that
   * a signed-in Vendor A is refused Vendor B's order. That needs two seeded
   * vendor accounts and a live Clerk instance, which this suite deliberately
   * does without; the rule itself is settled exhaustively in
   * tests/vendors.test.ts against `mayVendorAct`.
   */
  ["/vendor", "bakery portal"],
  ["/vendor/orders/MC-0000", "bakery order detail"],
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
    // Nor anything from behind the newest door.
    await expect(page.locator("body")).not.toContainText("Makemycake orders");
  });
}

test("shopping and a guest order are untouched by any of this", async ({ page }) => {
  /*
   * The one regression that would matter most: authentication must not have put
   * a wall in front of the thing this bakery sells. The thing it sells is now
   * the shop rather than the builder — see lib/flags — so this follows the same
   * property down the current journey instead.
   */
  for (const path of ["/", "/shop", "/cakes/chocolate-truffle", "/cart", "/checkout"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} serves`).toBeLessThan(400);
    expect(page.url(), `${path} is not a sign-in wall`).not.toMatch(/\/sign-in/);
  }

  // And no sign-in prompt in the checkout chrome: guest checkout is the default.
  await expect(page.getByRole("main").getByRole("link", { name: /sign in/i })).toHaveCount(0);
});

/**
 * The builder's door is shut, and shut the same way for everybody.
 *
 * This is not an authorisation test — the gate is a feature flag, not a role —
 * but it belongs beside them for the property it shares: knowing a URL must not
 * be enough to get through. All nine steps and the entry route render the same
 * Coming Soon page, because they all render inside app/build/layout.tsx.
 */
test("the 3D builder is held back on every one of its URLs", async ({ page }) => {
  test.skip(BUILDER_ENABLED, "the builder is switched on in this environment");

  for (const path of ["/build", "/build/shape", "/build/toppings", "/build/review"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "3D Cake Builder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Coming soon" })).toBeDisabled();
    // And the builder itself never mounted: no canvas, no WebGL context.
    await expect(page.locator("canvas")).toHaveCount(0);
  }
});

test("the sign-in page is ours around Clerk's, and does not demand an account", async ({ page }) => {
  await page.goto("/sign-in");

  // The chrome is this bakery's: the wordmark over the photograph, and the line
  // that matters most on this page — that none of it is required to buy a cake.
  await expect(page.getByRole("link", { name: "Makemycake" })).toBeVisible();
  /*
   * A pattern rather than a literal, and the apostrophe is why: this copy is
   * typeset with a right single quote (U+2019) like the rest of the storefront,
   * and a test that pins the straight U+0027 fails the moment somebody sets the
   * text properly. `.` matches either without caring which is in the source.
   */
  await expect(page.getByRole("main")).toContainText(/don.t need an account/i);

  // The page names itself, in this brand's voice. Clerk's own header is off, so
  // if this heading goes missing the form has nothing naming it at all.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome back");

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

/**
 * The other half of the same door.
 *
 * /sign-up had no test of its own, which was survivable while it was the same
 * component with a different string and is not now: the two pages share a shell
 * whose whole job is to look identical on both, and the one thing that must be
 * true on this one — that a shop supporting guest checkout never implies an
 * account is required — is the easiest thing in the world to lose in a redesign.
 */
test("the sign-up page matches it, and still says an account is optional", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(page.getByRole("link", { name: "Makemycake" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await expect(page.getByRole("main")).toContainText(/don.t need an account/i);

  // And the way out is a real link to the shop, not a dead sentence.
  await expect(page.getByRole("main").getByRole("link", { name: "Pick one" })).toHaveAttribute(
    "href",
    "/shop",
  );

  await expect(page.locator(".cl-rootBox, .auth-sheet p").first()).toBeVisible();
});

/**
 * Every field says what it is for.
 *
 * WCAG 2.1 §1.3.5 at AA, and the practical half of it: a password manager that
 * knows which box is the address will fill it. Clerk's markup leaves the
 * attribute off its identifier and email fields, so components/AuthAutofill
 * adds it — which means this is testing our code and not the vendor's, and is
 * exactly the kind of thing that disappears silently when somebody upgrades a
 * dependency or renames a container class.
 *
 * `new-password` on the sign-up field is Clerk's own and is asserted for the
 * opposite reason: it proves AuthAutofill did *not* overwrite it with the
 * `current-password` its table would otherwise have supplied.
 */
for (const [path, field, expected] of [
  ["/sign-in", "identifier", "username"],
  ["/sign-in", "password", "current-password"],
  ["/sign-up", "emailAddress", "email"],
  ["/sign-up", "password", "new-password"],
] as const) {
  test(`${path} declares autocomplete="${expected}" on ${field}`, async ({ page }) => {
    await page.goto(path);
    // Clerk mounts after hydration and AuthAutofill runs after Clerk.
    const input = page.locator(`.s-auth input[name="${field}"]`);
    await expect(input).toHaveAttribute("autocomplete", expected);
  });
}

/**
 * No developer-facing chrome in front of a customer.
 *
 * Clerk paints a "Development mode" ribbon into its own footer on every
 * development instance. It is addressed to whoever is building the site and is
 * shown to whoever is buying a cake, and `appearance.options` switches it off —
 * under `options`, which is the key the runtime actually reads, and *not*
 * `layout`, which it silently ignores. That silence is the reason this is a
 * test: the wrong key type-checks against a loose object, renders without a
 * warning, and looks exactly like having forgotten to set it.
 *
 * Skipped on a production instance, where the ribbon never renders and passing
 * would prove nothing.
 */
test("no development-mode chrome reaches the customer", async ({ page }) => {
  await page.goto("/sign-in");
  await page.locator(".cl-rootBox, .auth-sheet p").first().waitFor();

  const dev = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_");
  test.skip(!dev, "not a development Clerk instance — there is no ribbon to hide");

  await expect(page.getByRole("main")).not.toContainText(/development mode/i);
  // Clerk's attribution is required and stays. Asserted so that "hide the dev
  // badge" can never quietly become "hide the whole footer".
  await expect(page.getByRole("main")).toContainText(/secured by/i);
});
