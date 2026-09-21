import { describe, expect, it } from "vitest";
import { CATALOG_GROUPS, CATEGORY_META, isCurrent, NAV } from "@/lib/adminNav";

/**
 * What the owner's sidebar offers, and what it deliberately does not.
 *
 * §51's first three acceptance criteria are a statement about a list, which
 * makes them testable without a browser: the active catalogue is Cakes and
 * nothing else, the builder's option pages are off the navigation, and their
 * implementation is still in the tree. The third is the one most worth a test,
 * because "we took it off the menu" and "we deleted it" look identical in a
 * screenshot and are opposite outcomes when the builder comes back.
 */

const ITEMS = NAV.flatMap((s) => s.items);
const HREFS = ITEMS.map((i) => i.href);

describe("the admin sidebar", () => {
  it("has the four sections the brief asks for, in order", () => {
    expect(NAV.map((s) => s.label)).toEqual([
      "Overview", "Operations", "Catalogue", "Business",
    ]);
  });

  it("offers Cakes as the whole of the catalogue", () => {
    // §51.1. One item, and it is the products a customer can actually buy.
    const catalogue = NAV.find((s) => s.label === "Catalogue")!;
    expect(catalogue.items).toHaveLength(1);
    expect(catalogue.items[0]!.href).toBe("/admin/cakes");
    expect(catalogue.items[0]!.label).toBe("Cakes");
  });

  it("offers no builder option page anywhere on the sidebar", () => {
    /*
     * §51.2, checked by prefix rather than by label, because the failure this
     * guards against is somebody re-adding "/admin/catalog/ingredients" under a
     * friendlier name. The builder is switched off (lib/flags), so a page
     * pricing sponges and toppings is work with no effect on anything for sale.
     */
    for (const href of HREFS) {
      expect(href.startsWith("/admin/catalog"), href).toBe(false);
    }
  });

  it("does not put the kitchen board on the owner's sidebar", () => {
    // §3: the owner confirms orders and decides who bakes them. The bench work
    // belongs to a partner bakery on /vendor or a baker on /kitchen.
    expect(HREFS).not.toContain("/kitchen");
    expect(HREFS).not.toContain("/vendor");
  });

  it("keeps every route it does offer inside the admin portal", () => {
    for (const href of HREFS) expect(href.startsWith("/admin"), href).toBe(true);
  });

  it("names every item once, with a label and an icon", () => {
    expect(new Set(HREFS).size).toBe(HREFS.length);
    for (const item of ITEMS) {
      expect(item.label, item.href).toBeTruthy();
      expect(item.icon, item.href).toBeTruthy();
    }
  });
});

describe("the builder's catalogue, still there and still unlinked", () => {
  it("keeps every option group and its pages", () => {
    /*
     * §51.3 and §15's "do not delete their underlying implementation". These
     * routes still answer, `priceCake` still reads the rows behind them, and
     * every order placed before CakeProduct was priced against them. What
     * changed is that nothing links to them while the builder is off.
     *
     * If this ever fails because the groups were removed, the sidebar test above
     * will still pass — which is precisely the pair of outcomes that look the
     * same from the outside and are not the same at all.
     */
    expect(CATALOG_GROUPS.map((g) => g.slug)).toEqual([
      "cakes", "ingredients", "addons", "pricing",
    ]);
  });

  it("still describes all ten option categories", () => {
    expect(Object.keys(CATEGORY_META)).toHaveLength(10);
    for (const [category, meta] of Object.entries(CATEGORY_META)) {
      expect(meta.label, category).toBeTruthy();
      expect(meta.blurb, category).toBeTruthy();
    }
  });
});

describe("marking the page you are on", () => {
  it("marks an exact hit", () => {
    expect(isCurrent({ href: "/admin", label: "Dashboard", icon: "home" }, "/admin")).toBe(true);
    expect(isCurrent({ href: "/admin", label: "Dashboard", icon: "home" }, "/admin/orders"))
      .toBe(false);
  });

  it("marks a nested item for the pages beneath it", () => {
    const orders = { href: "/admin/orders", label: "Orders", icon: "orders", nested: true };
    expect(isCurrent(orders, "/admin/orders")).toBe(true);
    expect(isCurrent(orders, "/admin/orders/MC-4471")).toBe(true);
  });

  it("gives up a path another item owns outright", () => {
    /*
     * Deliveries lives at /admin/orders/today, under the prefix Orders matches.
     * Without the OWNED set both would light at once, and a sidebar with two
     * current items has stopped saying where you are.
     */
    const orders = { href: "/admin/orders", label: "Orders", icon: "orders", nested: true };
    const deliveries = { href: "/admin/orders/today", label: "Deliveries", icon: "delivery" };
    expect(isCurrent(orders, "/admin/orders/today")).toBe(false);
    expect(isCurrent(deliveries, "/admin/orders/today")).toBe(true);
  });

  it("marks exactly one item for every route the sidebar offers", () => {
    // The property the two rules above exist to produce, checked across the real
    // list rather than on the two examples that motivated them.
    for (const href of HREFS) {
      const hits = ITEMS.filter((i) => isCurrent(i, href));
      expect(hits.map((h) => h.href), href).toEqual([href]);
    }
  });
});
