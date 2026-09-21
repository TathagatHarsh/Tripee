import { expect, test } from "@playwright/test";

/**
 * The journey, end to end: a stranger arrives at the shop, picks a cake, puts
 * it in the basket, checks out as a guest and comes away with a real order
 * reference.
 *
 * This is the storefront's counterpart to e2e/happy-path.spec.ts, which walks
 * the nine-step 3D builder and is skipped while that feature is held back. The
 * two describe the same promise — somebody can buy a cake from this bakery
 * without an account and without paying up front — down the two different paths
 * the product has had.
 *
 * ## This writes a real order, so it needs a database it is allowed to write to
 *
 * Run it against a scratch Postgres, never against the live one. The shop now
 * reads its cakes from CakeProduct, so the target database also has to have
 * been seeded (`npm run db:seed`) or every assertion below fails on an empty
 * shelf rather than on anything this test is about.
 */

const ORDER_REF = /^MC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

test("a stranger can shop, add to the cart and get an order reference", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Make every celebration");

  // The primary call to action is the shop, and it is not the builder.
  await page.getByRole("link", { name: "Shop cakes" }).first().click();
  await expect(page).toHaveURL(/\/shop$/);

  // ── The collection filters from the URL, so it works with no JavaScript ──
  await page.getByRole("link", { name: "Chocolate Cakes" }).first().click();
  await expect(page).toHaveURL(/category=chocolate/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Chocolate Cakes");

  // ── The cake ──────────────────────────────────────────────────────────
  await page.goto("/cakes/chocolate-truffle");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chocolate Truffle");

  const price = page.locator("main").getByText(/^₹[\d,]+\.\d{2}$/).first();
  const atRest = await price.textContent();

  /*
   * The size is a fact about the cake, not a control.
   *
   * There used to be a radio group here and a "changing the size reprices"
   * assertion under it. A cake is one CakeProduct row at one size for one
   * price now — see the note in BuyPanel — so the size is printed and the
   * shopper's remaining choices are the message, the slot and the pincode.
   */
  await expect(page.getByText("Size", { exact: true })).toBeVisible();

  // Asking for a message adds the piping charge, from the catalogue.
  await page.getByLabel("Message on the cake").fill("Happy Birthday Amma");
  await expect(price).not.toHaveText(atRest!);

  await page.getByPlaceholder("Pincode, e.g. 500081").fill("500081");

  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  // The control acknowledges in place rather than firing a toast.
  await expect(page.getByRole("button", { name: "Added" })).toBeVisible();

  // ── The cart ──────────────────────────────────────────────────────────
  await page.goto("/cart");
  const line = page.getByRole("listitem").filter({ hasText: "Chocolate Truffle" }).first();
  await expect(line).toBeVisible();
  await expect(line).toContainText("Happy Birthday Amma");

  // Quantity is a control on the line, and the summary follows it.
  await page.getByRole("button", { name: /One more Chocolate Truffle/ }).click();
  await expect(page.getByRole("link", { name: "Cart, 2 cakes" })).toBeVisible();
  await page.getByRole("button", { name: /One fewer Chocolate Truffle/ }).click();

  // ── Checkout ──────────────────────────────────────────────────────────
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  // No sign-in wall: guest checkout is the default and always has been.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Checkout");

  // The button waits for the server to agree with the client's arithmetic.
  await expect(page.getByText("Price confirmed with the kitchen.")).toBeVisible();

  await page.getByLabel("Name").fill("Aryu");
  await page.getByLabel("Phone").fill("9876543210");

  await page.getByRole("button", { name: /^Place order/ }).click();

  await expect(
    page.getByRole("heading", { name: /officially on its way/ }),
  ).toBeVisible();
  const ref = await page.getByText(ORDER_REF).first().textContent();
  expect(ref?.trim()).toMatch(ORDER_REF);

  /*
   * And then the confirmation takes them there itself. Waited for rather than
   * raced: the celebration replaces the URL after `AUTO_TRACK_MS`, so anything
   * this test does to the page before then is a coin toss with a navigation.
   */
  await page.waitForURL(new RegExp(`/orders/${ref?.trim()}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ref!.trim());

  /* Back, from a page reached by `replace`, is the cart the order emptied —
     and not a checkout form sitting on a basket it could submit again. */
  await page.goBack();
  await expect(page).toHaveURL(/\/cart$/);

  // And the basket is empty afterwards, so a reload cannot re-order it.
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cake box is empty" })).toBeVisible();
});

test("the cart survives a reload", async ({ page }) => {
  await page.goto("/cakes/red-velvet-classic");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("link", { name: "Cart, 1 cake" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: "Cart, 1 cake" })).toBeVisible();
});

test("the old catalogue address still lands somewhere useful", async ({ page }) => {
  await page.goto("/presets");
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every cake we bake");
});

test("searching the shop finds a cake by name", async ({ page }) => {
  await page.goto("/shop?q=biscoff");
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.filter({ hasText: "Biscoff" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("biscoff");
});

/* ------------------------------------------------------------- the waiting */

/**
 * The loading mark, for somebody who asked for no motion.
 *
 * Same contract as the confirmation's scene in e2e/checkout.spec.ts and the
 * same way to break it: the resting state has to be a shut cake box, not a
 * half-open one frozen on a keyframe. This one loops forever while it is on
 * screen, so getting it wrong is worse — a perpetual animation is exactly what
 * `prefers-reduced-motion` is asking not to be shown.
 *
 * JavaScript off, so the cart's hydration gate never opens and the panel stays
 * put long enough to be measured. That is also a real customer: the panel is
 * what the server renders, and it is what somebody with a failed bundle sees.
 */
test("the loading mark rests when motion is turned down", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  const page = await ctx.newPage();

  try {
    await page.goto("/cart");
    await expect(page.getByText("Getting your cake box…")).toBeVisible();

    const mark = await page.evaluate(() => {
      const lid = document.querySelector(".s-bake-lid");
      const steam = document.querySelector(".s-bake-steam > *");
      const glow = document.querySelector(".s-bake-glow");
      return {
        reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
        /* Nothing is running … */
        lid: lid ? getComputedStyle(lid).animationName : null,
        glow: glow ? getComputedStyle(glow).animationName : null,
        /* … and what is left is a shut box with no heat coming off it. */
        steam: steam ? getComputedStyle(steam).opacity : null,
        lidTransform: lid ? getComputedStyle(lid).transform : null,
      };
    });

    expect(mark.reduce).toBe(true);
    expect(mark.lid).toBe("none");
    expect(mark.glow).toBe("none");
    expect(mark.steam).toBe("0");
    expect(mark.lidTransform).toBe("none");
  } finally {
    await ctx.close();
  }
});

/**
 * The card's own route into the basket, which is the one §2 changed.
 *
 * The test above buys from the product page, where the size and the sponge are
 * answered inline. This is the other half: a card, where clicking "Add to cart"
 * must NOT add anything until the shopper has said which cake they mean — and
 * where two different answers have to become two different lines rather than
 * one line of two.
 *
 * Pineapple Delight is the subject because the seed gives it several sizes and
 * both sponges; a cake with one of each resolves itself and would prove nothing.
 */
test("a card asks which version before it adds anything", async ({ page }) => {
  await page.goto("/shop?q=Pineapple");

  const card = page.getByRole("listitem").filter({ hasText: "Pineapple Delight" }).first();
  /* No misleading badge, and the neutral line in its place. §7. */
  await expect(card).not.toContainText("Eggless\n");
  await expect(card).toContainText("From ");

  await card.getByRole("button", { name: /^Add to cart/ }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  /* Nothing has been added: the header's badge is still absent. */
  await expect(page.getByRole("link", { name: /Cart, \d+ cake/ })).toHaveCount(0);

  /* The CTA stays shut until both halves are answered. */
  const add = sheet.getByRole("button", { name: "Add to cart", exact: true });
  await expect(add).toBeDisabled();

  await sheet.getByRole("radio", { name: /^0\.5 kg/ }).click();
  await expect(add).toBeDisabled();

  const withEgg = sheet.getByRole("radio", { name: /With egg/ });
  await withEgg.click();
  await expect(add).toBeEnabled();

  await add.click();
  await expect(sheet.getByText("Added to your box")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart, 1 cake" })).toBeVisible();

  /* The same cake, a different sponge: a second line, not a second unit. */
  await page.getByRole("button", { name: /^Add to cart/ }).first().click();
  const again = page.getByRole("dialog");
  await again.getByRole("radio", { name: /^0\.5 kg/ }).click();
  await again.getByRole("radio", { name: /Eggless/ }).click();
  await again.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByRole("link", { name: "Cart, 2 cakes" })).toBeVisible();

  await page.goto("/cart");
  const lines = page.getByRole("listitem").filter({ hasText: "Pineapple Delight" });
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText("With egg");
  await expect(lines.nth(1)).toContainText("Eggless");
  /* And they are priced apart, which is the whole reason they are two lines. */
  await expect(lines.nth(0)).not.toContainText(
    (await lines.nth(1).getByText(/each/).innerText()).trim(),
  );
});

/*
 * The total counts rather than jumps — and stops counting when asked to.
 *
 * Both halves in one test on purpose. Asserting only the reduced case would
 * pass just as happily if the roll had never been wired up at all, so the
 * default context is the control: it proves the assertion can fail.
 */
test("the price counter rolls, and rests when motion is turned down", async ({ browser }) => {
  async function strip(reducedMotion: "reduce" | "no-preference") {
    const ctx = await browser.newContext({ reducedMotion });
    const page = await ctx.newPage();
    try {
      await page.goto("/cakes/chocolate-truffle");
      await page.locator(".s-roll-strip").first().waitFor();
      return await page.evaluate(() => {
        const el = document.querySelector(".s-roll-strip")!;
        return {
          reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
          seconds: parseFloat(getComputedStyle(el).transitionDuration),
          /* What a screen reader is given, beside the ten digits it is not. */
          spoken: document.querySelector(".s-roll")?.previousElementSibling?.textContent ?? null,
          hidden: document.querySelector(".s-roll")?.getAttribute("aria-hidden"),
        };
      });
    } finally {
      await ctx.close();
    }
  }

  const rolling = await strip("no-preference");
  expect(rolling.reduce).toBe(false);
  expect(rolling.seconds).toBeGreaterThan(0.2);

  const rested = await strip("reduce");
  expect(rested.reduce).toBe(true);
  /* The global reduce block collapses every transition, so the digits are
     placed at their new value instead of travelling to it. */
  expect(rested.seconds).toBeLessThan(0.05);

  /* Either way the figure is a price, and the strips are not read aloud. */
  for (const seen of [rolling, rested]) {
    expect(seen.spoken).toMatch(/^₹[\d,]+\.\d{2}$/);
    expect(seen.hidden).toBe("true");
  }
});
