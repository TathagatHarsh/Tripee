import { expect, test } from "@playwright/test";

/**
 * The order API, from outside.
 *
 * e2e/shop.spec.ts walks the journey a customer takes and proves the shop
 * works. This file is the other half: the things a *browser* can do that a
 * customer cannot — send the same request twice, edit the price on the way out,
 * put somebody else's user id in the body, ask for minus one cake. None of them
 * are reachable through the UI, which is exactly why they are worth a test: the
 * form is not the only thing that can call this endpoint.
 *
 * ## What it needs, and what it writes
 *
 * A database it is allowed to write to, and one that has been seeded: the shop
 * reads its cakes from CakeProduct now, so the UI-driven cases below need
 * `npm run db:seed` to have been run against the target. Never point this at
 * the live database.
 *
 * One real order per run, and deliberately only one. Every other case here is a
 * refusal, which writes nothing at all. The order that is written is the
 * double-submit case — the whole point of which is that sending it five times
 * leaves one row — and it carries an obvious synthetic name, so anybody looking
 * at the board knows what it is.
 *
 * The cases that need an owner to change the catalogue mid-basket — an option
 * withdrawn, a filling repriced — are settled in tests/checkout.test.ts, where
 * the catalogue is a fixture rather than a production table. The tampered-quote
 * case below exercises the same code path (`reviewBasket`'s comparison) by the
 * only route a suite without admin credentials has to it.
 */

const ORDER_REF = /^MC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * A cake the API will accept, written out rather than imported.
 *
 * `DEFAULT_CAKE` would be the DRY choice and the wrong one: this is a contract
 * test for a request shape, and importing the application's own idea of a cake
 * would let a change to that constant silently change what is being asserted.
 */
const CAKE = {
  version: 1,
  shape: "round",
  size: "1kg",
  tiers: 1,
  layers: 3,
  sponge: "vanilla",
  filling: "none",
  frosting: "american-buttercream",
  coverage: "full",
  finish: "smooth",
  frostingColor: "#F3E7D3",
  hasDrip: false,
  toppings: [],
  eggless: true,
  sugarFree: false,
  delivery: "standard",
  pincode: "500081",
} as const;

const CUSTOMER = {
  customerName: "E2E Duplicate Check",
  customerPhone: "9876543210",
};

const order = (extra: Record<string, unknown> = {}) => ({
  ...CUSTOMER,
  items: [{ config: CAKE, qty: 1 }],
  ...extra,
});

/* ------------------------------------------------------------- duplicates */

test("the same checkout sent five times makes one order", async ({ request }) => {
  const key = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const body = order({
    idempotencyKey: key,
    /*
     * Everything a tampered client would like to decide, in one request. None
     * of it survives validation — see tests/checkout.test.ts — and the
     * assertions below are that the row came out with the server's numbers
     * rather than with these.
     */
    userId: "user_somebody_else",
    status: "delivered",
    paymentStatus: "paid",
    totalPaise: 1,
    payablePaise: 1,
    vendorId: "vendor_mine",
  });

  const first = await request.post("/api/orders", { data: body });
  // 503 means this deployment has no database attached, which is a documented
  // state rather than a failure — there is nothing to prove about duplicates.
  test.skip(first.status() === 503, "no database attached to this deployment");

  expect(first.status(), await first.text()).toBe(201);
  const a = await first.json();

  expect(a.orders).toHaveLength(1);
  expect(a.orders[0].ref).toMatch(ORDER_REF);
  expect(a.duplicate).toBe(false);
  // The client asked to pay one paisa. The server priced the cake.
  expect(a.totalPaise).toBeGreaterThan(1000);
  expect(a.orders[0].totalPaise).toBe(a.totalPaise);
  expect(a.subtotalPaise + a.gstPaise).toBe(a.totalPaise);

  /* The second send: a refresh, a retry after a timeout, a second tap. */
  const second = await request.post("/api/orders", { data: body });
  expect(second.status()).toBe(200);
  const b = await second.json();

  expect(b.duplicate).toBe(true);
  expect(b.orders.map((o: { ref: string }) => o.ref)).toEqual(
    a.orders.map((o: { ref: string }) => o.ref),
  );

  /* And three at once, which is what a double-click actually looks like. */
  const racing = await Promise.all(
    [0, 1, 2].map(() => request.post("/api/orders", { data: body })),
  );
  for (const res of racing) {
    expect([200, 201]).toContain(res.status());
    const r = await res.json();
    expect(r.orders[0].ref).toBe(a.orders[0].ref);
  }
});

/* --------------------------------------------------------------- refusals */

test("a basket the server disagrees with is refused, and nothing is written", async ({
  request,
}) => {
  const probe = await request.post("/api/orders", {
    data: order({ items: [{ config: CAKE, qty: 0 }] }),
  });
  test.skip(probe.status() === 503, "no database attached to this deployment");

  const cases: {
    what: string;
    data: Record<string, unknown>;
    status: number;
    code?: string;
  }[] = [
    {
      what: "a price the client made up",
      data: order({ items: [{ config: CAKE, qty: 1, quotedTotalPaise: 100 }] }),
      status: 409,
      code: "price_changed",
    },
    { what: "no cakes at all", data: order({ items: [] }), status: 400 },
    { what: "minus one cake", data: order({ items: [{ config: CAKE, qty: -1 }] }), status: 400 },
    { what: "a fractional cake", data: order({ items: [{ config: CAKE, qty: 1.5 }] }), status: 400 },
    {
      what: "more cakes than one order carries",
      data: order({ items: Array.from({ length: 6 }, () => ({ config: CAKE, qty: 5 })) }),
      status: 400,
    },
    {
      what: "a flavour that does not exist",
      data: order({ items: [{ config: { ...CAKE, sponge: "unicorn" }, qty: 1 }] }),
      status: 400,
    },
    { what: "no name", data: order({ customerName: "" }), status: 400 },
    {
      what: "a number nobody can be rung on",
      data: order({ customerPhone: "12345" }),
      status: 400,
    },
    {
      what: "a pincode the bakery does not reach",
      data: order({ items: [{ config: { ...CAKE, pincode: "560001" }, qty: 1 }] }),
      status: 422,
    },
    {
      what: "a cake that cannot be built",
      data: order({
        items: [
          { config: { ...CAKE, frosting: "whipped-cream", tiers: 2, size: "2kg" }, qty: 1 },
        ],
      }),
      status: 422,
    },
  ];

  for (const c of cases) {
    const res = await request.post("/api/orders", { data: c.data });
    expect(res.status(), c.what).toBe(c.status);

    const json = await res.json();
    expect(json.orders, c.what).toBeUndefined();
    expect(typeof json.error, c.what).toBe("string");
    if (c.code) expect(json.code, c.what).toBe(c.code);

    /* §20: a customer reads these. No stack traces, no table names, no paths. */
    expect(json.error, c.what).not.toMatch(/prisma|postgres|\bat \/|node_modules|Invalid `/i);
  }
});

/* ------------------------------------------------------------- cross-site */

test("an order posted from somebody else's page is refused", async ({ request }) => {
  /*
   * The request a CSRF page would make. `<form enctype="text/plain">` needs no
   * preflight and `req.json()` parses whatever arrives, so without the check in
   * lib/apiGuard this would place a real order in a signed-in customer's name,
   * from a page they merely visited.
   *
   * The same body with no Origin at all is the request every other test in this
   * file sends, and it is still accepted — that asymmetry is the design, and it
   * is why this test lives next to them.
   */
  const res = await request.post("/api/orders", {
    headers: { origin: "https://evil.example" },
    data: order({ idempotencyKey: `e2e-csrf-${Date.now()}` }),
  });

  expect(res.status()).toBe(403);

  const json = await res.json();
  expect(json.code).toBe("cross_site");
  expect(json.orders).toBeUndefined();
  expect(json.error).not.toMatch(/prisma|postgres|node_modules|\bat \//i);
});

test("a price check from somebody else's page is refused too", async ({ request }) => {
  const res = await request.post("/api/price", {
    headers: { origin: "https://evil.example" },
    data: { config: CAKE },
  });
  expect(res.status()).toBe(403);
});

test("a body that is not JSON is refused rather than crashing", async ({ request }) => {
  const res = await request.post("/api/orders", {
    headers: { "content-type": "application/json" },
    data: "not json at all",
  });
  expect([400, 503]).toContain(res.status());
});

/* --------------------------------------------------------- guest tracking */

test("a guest can track the order they placed, and only from the browser that placed it", async ({
  page,
  browser,
}) => {
  await page.goto("/cakes/red-velvet-classic");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("link", { name: "Cart, 1 cake" })).toBeVisible();

  await page.goto("/checkout");
  await expect(page.getByText("Price confirmed with the kitchen.")).toBeVisible();

  await page.getByLabel("Name").fill("Aryu");
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: /^Place order/ }).click();

  await expect(
    page.getByRole("heading", { name: /officially on its way/ }),
  ).toBeVisible();
  const ref = (await page.getByText(ORDER_REF).first().textContent())?.trim() ?? "";
  expect(ref).toMatch(ORDER_REF);

  /*
   * The tracking link works here, with no account — the cookie /api/orders set
   * is what authorises it.
   */
  await page.getByRole("link", { name: "Track your order" }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${ref}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ref);

  /* A refresh still works: the cookie is not component state, so the
     confirmation screen is not the only way back to the order. */
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ref);

  /*
   * And the half that matters. The same URL, in a browser that did not place
   * the order — which is what a forwarded link, a shoulder-surfed docket or a
   * guessed reference amounts to. Knowing the reference must not be enough.
   */
  const stranger = await browser.newContext();
  try {
    const theirPage = await stranger.newPage();
    await theirPage.goto(`/orders/${ref}`);

    /*
     * Asserted on what was rendered, not on the status code. The page streams,
     * so the first document is a 200 carrying the loading shell and the refusal
     * arrives with the rest of the stream — e2e/auth.spec.ts settles the same
     * property the same way, by looking at where the browser ended up.
     */
    await expect(theirPage).toHaveURL(/\/sign-in(\?|\/|$)/);

    /* And nothing of the order came back with the shell. The reference itself
       is in the <title> because the visitor typed it into the URL — it renders
       identically for a reference that does not exist, so it confirms nothing.
       What must never appear is anything only the order could tell you. */
    const body = theirPage.locator("body");
    await expect(body).not.toContainText("Aryu");
    await expect(body).not.toContainText("9876543210");
    await expect(body).not.toContainText("Order status");
    await expect(body).not.toContainText("Delivery details");
    await expect(body).not.toContainText("Awaiting our call");
    await expect(theirPage.getByRole("heading", { level: 1 })).not.toHaveText(ref);
  } finally {
    await stranger.close();
  }
});

/* ------------------------------------------------------- the cart survives */

test("a checkout that cannot reach the server keeps the basket", async ({ page }) => {
  await page.goto("/cakes/red-velvet-classic");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("link", { name: "Cart, 1 cake" })).toBeVisible();

  await page.goto("/checkout");
  await expect(page.getByText("Price confirmed with the kitchen.")).toBeVisible();

  await page.getByLabel("Name").fill("Aryu");
  await page.getByLabel("Phone").fill("9876543210");

  /* The order request never lands. Nothing is written, and the customer must
     not be left holding an empty basket they have to rebuild. */
  await page.route("**/api/orders", (route) => route.abort("failed"));
  await page.getByRole("button", { name: /^Place order/ }).click();

  /* Scoped to main: Next's own route announcer is also role="alert", exactly as
     e2e/happy-path.spec.ts has to work around. */
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/try again/i);
  await expect(page.getByRole("link", { name: "Cart, 1 cake" })).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toHaveCount(0);
});

/* ---------------------------------------------------------- reduced motion */

/**
 * The confirmation, for somebody who asked the operating system for no motion.
 *
 * The contract in globals.css is that every element's *base* CSS is its
 * finished state and the keyframes only exist inside
 * `prefers-reduced-motion: no-preference`. That is easy to write and easy to
 * break — one animation moved out of the media query, or one element whose
 * resting style is its *start* state, and a reader who wants no motion gets a
 * closed box that never opens and a tick that is never drawn.
 *
 * So this asserts the finished state directly rather than asserting that
 * nothing moved: lid gone, cake up, tick solid, and every word on the screen.
 */
test.describe("the confirmation without motion", () => {
  test("shows the whole celebration at rest, and still goes to tracking", async ({
    page,
  }) => {
    /* `emulateMedia` and not `test.use({ reducedMotion })`: the fixture is
       overridden by this config's `devices["Desktop Chrome"]` project and the
       page still reports `no-preference`, so the test passes against the
       animated rendering and proves nothing. Asserted here rather than trusted:
       see the `reduceMatches` check below. */
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);

    await page.goto("/cakes/red-velvet-classic");
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await page.goto("/checkout");
    await expect(page.getByText("Price confirmed with the kitchen.")).toBeVisible();
    await page.getByLabel("Name").fill("Aryu");
    await page.getByLabel("Phone").fill("9876543210");
    await page.getByRole("button", { name: /^Place order/ }).click();

    await expect(
      page.getByRole("heading", { name: /officially on its way/ }),
    ).toBeVisible();

    const ref = (await page.getByText(ORDER_REF).first().textContent())?.trim() ?? "";
    expect(ref).toMatch(ORDER_REF);
    await expect(page.getByRole("link", { name: "Track your order" })).toBeVisible();

    const scene = await page.evaluate(() => {
      const svg = document.querySelector<SVGElement>(".s-placed")
        ?.parentElement?.querySelector("svg");
      const lid = document.querySelector(".s-box-lid");
      const cake = document.querySelector(".s-box-cake");
      const check = document.querySelector(".s-check");
      return {
        sceneHeight: Math.round(svg?.getBoundingClientRect().height ?? 0),
        /* The lid has been lifted away — that is what makes the box open. */
        lid: lid ? getComputedStyle(lid).opacity : null,
        /* And the cake has not been left parked inside it. */
        cake: cake ? getComputedStyle(cake).transform : null,
        /* A tick with no dash array is a tick that is fully drawn. */
        check: check ? getComputedStyle(check).strokeDasharray : null,
      };
    });

    expect(scene.sceneHeight).toBeGreaterThan(100);
    expect(scene.lid).toBe("0");
    expect(scene.cake).toBe("none");
    expect(scene.check).toBe("none");

    // The navigation is not an animation, so it still happens.
    await page.waitForURL(new RegExp(`/orders/${ref}$`));
  });
});
