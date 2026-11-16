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
  it("nav groups and labels match the spec", () => {
    // Spec section 2, in order.
    expect(NAV.map((s) => s.label)).toEqual(["Home", "Orders", "Bakeries", "Catalogue", "Settings"]);
    expect(NAV.map((s) => s.items.map((i) => [i.label, i.href]))).toEqual([
      [["Home", "/admin"]],
      [
        ["Orders", "/admin/orders"],
        ["Deliveries today", "/admin/orders/today"],
        ["Custom requests", "/admin/custom-requests"],
        ["Payments", "/admin/payments"],
      ],
      [
        ["Bakeries", "/admin/vendors"],
        ["Cake availability", "/admin/inventory"],
      ],
      [
        ["Cakes", "/admin/cakes"],
        ["Options & prices", "/admin/catalog"],
      ],
      [
        ["Shop", "/admin/settings"],
        ["Delivery slots", "/admin/delivery"],
        ["Staff", "/admin/staff"],
      ],
    ]);
  });

  it("every href existed before", () => {
    // Routes are regrouped and relabelled, never moved.
    const before = [
      "/admin", "/admin/orders", "/admin/orders/today", "/admin/custom-requests",
      "/admin/payments", "/admin/vendors", "/admin/inventory", "/admin/cakes",
      "/admin/catalog", "/admin/settings", "/admin/delivery", "/admin/staff",
    ];
    for (const href of HREFS) expect(before, href).toContain(href);
  });

  it("keeps Cake availability partners-only", () => {
    expect(ITEMS.find((i) => i.href === "/admin/inventory")!.partnersOnly).toBe(true);
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
