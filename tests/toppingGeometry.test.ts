import { describe, expect, it } from "vitest";
import { TOPPINGS } from "@/lib/catalog";
import { toppingGeo } from "@/components/three/toppingGeometry";

/**
 * `sink` is a fraction of a piece's own height and that height is *measured* off
 * the built geometry, so editing a profile silently changes what a sink means.
 *
 * The strawberry is the one where that is load-bearing rather than cosmetic. It
 * is a whole solid of revolution laid on its side with half of it deliberately
 * inside the frosting, and the entire illusion is that the cut face lands on the
 * surface. A tenth out in either direction is a berry hovering over the cream or
 * a red smear sunk into it, and nothing in the type system notices.
 */
describe("toppingGeo", () => {
  it("seats the halved strawberry's cut face on the frosting", () => {
    const g = toppingGeo("strawberry");
    // Toppings.place seats a piece at surfaceY - (bottom + height * sink) * size,
    // so this expression is how far the origin ends up off the surface. Measured
    // against the berry's own height rather than an absolute, and loose enough to
    // allow the deliberate nestle: the failure this catches is a sink that has
    // stopped meaning half, not a profile nudged by a millimetre.
    expect(Math.abs(g.bottom + g.height * g.sink)).toBeLessThan(g.height * 0.08);
  });

  it("gives every garnish a real height and a sink inside its own body", () => {
    for (const { value } of TOPPINGS) {
      const g = toppingGeo(value);
      expect(g.height, value).toBeGreaterThan(0);
      expect(g.sink, value).toBeGreaterThanOrEqual(0);
      expect(g.sink, value).toBeLessThanOrEqual(1);
    }
  });

  it("flecks some of the strawberry's skin and not all of it", () => {
    const colour = toppingGeo("strawberry").geometry.getAttribute("color");
    const reds = new Set<number>();
    for (let i = 0; i < colour.count; i++) {
      reds.add(Math.round(colour.getX(i) * 1e4));
    }
    // Exactly two: the skin and the achene. One means the position hash has
    // stopped discriminating and the berry is back to being a plain red dome.
    expect(reds.size).toBe(2);
  });
});
