import { describe, expect, it } from "vitest";
import {
  insideOutline, outlinePerimeter, shellOutline, shellThickness, tierDims,
} from "@/components/three/geometry";
import { place, scaleForSize } from "@/components/three/Toppings";
import { toppingGeo } from "@/components/three/toppingGeometry";
import { DEFAULT_CAKE, Topping } from "@/lib/schema";
import type { Coverage, Shape, ToppingPlacement } from "@/lib/schema";

/**
 * Placement is pure geometry whose mistakes are invisible until something renders
 * it, which is how every placement came to be laid on a circle inscribed in the
 * shape — a ring in a small circle in the middle of a square top with all four
 * corners bare, a cascade buried inside a square's flat wall — and stayed that way
 * through a release. These are the assertions that would have said so.
 */

const SHAPES: Shape[] = ["round", "square", "rectangle", "hexagon", "heart"];

function fixture(shape: Shape, placement: ToppingPlacement, density = 3, seed = 12345) {
  const tiers = tierDims("2kg", 1, shape);
  const geo = toppingGeo("strawberry");
  const size = geo.scale * scaleForSize(tiers[0].radius);
  const { radius, height } = tiers[0];
  return {
    size,
    face: shellOutline(shape, radius, height, 192, "top"),
    wall: shellOutline(shape, radius, height, 192, "widest"),
    placed: place(
      { kind: "strawberry", placement, density },
      { ...DEFAULT_CAKE, shape, size: "2kg", toppings: [] },
      tiers, seed, size, geo, 400,
    ),
  };
}

/** Width and depth of what was placed, which is the whole question. */
function extent(pts: { position: { x: number; z: number } }[]) {
  const xs = pts.map(p => p.position.x);
  const zs = pts.map(p => p.position.z);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    z: Math.max(...zs) - Math.min(...zs),
  };
}

describe("topping placement follows the cake's outline", () => {
  /*
   * The load-bearing test, and the only one of these that fails on the old code
   * for the actual reason. Containment does not catch a circle: a ring drawn
   * inside a square is on the square's top, perfectly legally, and looks nothing
   * like a ring on a square. What catches it is the *shape* of what was laid down.
   *
   * A rectangle is 1.28 radii along x and 0.82 along z, so anything following it
   * is half again as wide as it is deep. A circle is as wide as it is deep whatever
   * it is drawn on, which is what these two placements used to produce.
   */
  for (const placement of ["top-ring", "top-scatter"] as const) {
    it(`lays ${placement} out as oblong as the rectangle it is on`, () => {
      const { face, placed } = fixture("rectangle", placement, 5);
      const want = extent(face.map(p => ({ position: p })));
      const got = extent(placed);
      expect(got.x / got.z).toBeGreaterThan((want.x / want.z) * 0.8);
    });
  }

  it("reaches into a square's corners rather than stopping at its inscribed circle", () => {
    /*
     * Over several seeds, because one throw of the darts proves nothing either
     * way: the corners are a small share of a square's area, so a single seed can
     * legitimately miss them. What cannot happen, at any seed, is a piece landing
     * outside the circle drawn inside the square — that was the whole field.
     */
    const inscribed = Math.min(...fixture("square", "top-scatter").face.map(p => Math.hypot(p.x, p.z)));
    const reach = Math.max(...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(seed =>
      fixture("square", "top-scatter", 5, seed).placed
        .map(p => Math.hypot(p.position.x, p.position.z))));
    expect(reach).toBeGreaterThan(inscribed);
  });

  for (const shape of SHAPES) {
    it(`keeps every piece on ${shape}'s top face`, () => {
      for (const placement of ["top-ring", "top-scatter", "crown"] as const) {
        const { face, placed } = fixture(shape, placement);
        expect(placed.length, `${shape}/${placement}`).toBeGreaterThan(0);
        for (const p of placed) {
          expect(
            insideOutline(face, p.position.x, p.position.z),
            `${shape}/${placement} at ${p.position.x.toFixed(2)},${p.position.z.toFixed(2)}`,
          ).toBe(true);
        }
      }
    });

    it(`puts ${shape}'s base border on the board, clear of the cake`, () => {
      const { wall, placed } = fixture(shape, "base-border");
      for (const p of placed) {
        expect(
          insideOutline(wall, p.position.x, p.position.z),
          `${shape} border at ${p.position.x.toFixed(2)},${p.position.z.toFixed(2)}`,
        ).toBe(false);
      }
    });

    it(`spaces ${shape}'s ring and border so no two pieces share a spot`, () => {
      for (const placement of ["top-ring", "base-border"] as const) {
        const { size, placed } = fixture(shape, placement, 5);
        for (let i = 0; i < placed.length; i++) {
          for (let j = i + 1; j < placed.length; j++) {
            // 0.6 of a piece, not a whole one: where the line turns a corner the
            // two neighbours are square to each other and need a piece's width
            // between them rather than its length.
            expect(
              placed[i].position.distanceTo(placed[j].position),
              `${shape}/${placement} pieces ${i} and ${j}`,
            ).toBeGreaterThan(size * 0.6);
          }
        }
      }
    });

    it(`lays ${shape}'s cascade against the wall it falls down`, () => {
      /*
       * The placement this broke worst. On a square the pieces were put at a
       * radius, so along the flat faces they were inside the frosting and off the
       * corners they hung in the air — 23 strawberries of which two were visible,
       * as slivers. Distance to the wall is the whole assertion.
       */
      const { size, wall, placed } = fixture(shape, "cascade");
      expect(placed.length).toBeGreaterThan(0);
      for (const p of placed) {
        const off = Math.min(...wall.map(w => Math.hypot(w.x - p.position.x, w.z - p.position.z)));
        expect(off, `${shape} cascade at ${p.position.x.toFixed(2)},${p.position.z.toFixed(2)}`)
          .toBeLessThan(size * 0.5);
      }
    });
  }

  /*
   * Count comes off the cake, so a shape with more edge than the circle inside it
   * has to buy more fruit. The square's top face perimeter is 22% longer than the
   * round one's; before this it was measured as 8% *shorter*, because both were
   * being read off a radius rather than off the outline.
   */
  it("gives a square more pieces than a round cake of the same weight", () => {
    const round = fixture("round", "top-scatter", 5);
    const square = fixture("square", "top-scatter", 5);
    expect(outlinePerimeter(square.face)).toBeGreaterThan(outlinePerimeter(round.face));
    expect(square.placed.length).toBeGreaterThan(round.placed.length);
  });
});

/**
 * Every garnish that lands on the top has to land on the *frosting*, and the
 * frosting is a shell built one thickness taller than the sponge it covers.
 *
 * Seating them on the sponge plane instead cost nothing visible for the tall
 * pieces and erased the short ones outright: an 8in cake carries a 3.6mm shell,
 * a scattered pistachio crumb stands 3.3mm, and eighty of them rendered inside
 * the buttercream on a cake that came back looking undecorated. Nothing in the
 * suite could see it, because a piece at the wrong height is still inside the
 * outline, still evenly spaced, and still the right count — every property the
 * tests above check. This is the one that says so.
 */
describe("top-face garnishes clear the frosting they are laid on", () => {
  const TOP: ToppingPlacement[] = ["top-ring", "top-scatter", "crown"];

  /** Lowest point of the piece as placed, in world Y. */
  const lowest = (
    p: { position: { y: number }; scale: number },
    bottom: number,
  ) => p.position.y + bottom * p.scale;

  for (const kind of Topping.options) {
    for (const placement of TOP) {
      it(`seats ${kind} (${placement}) on the shell, not the sponge`, () => {
        const tiers = tierDims("1.5kg", 1, "round");
        const geo = toppingGeo(kind);
        const size = geo.scale * scaleForSize(tiers[0].radius);
        const placed = place(
          { kind, placement, density: 4 },
          { ...DEFAULT_CAKE, size: "1.5kg", coverage: "full", toppings: [] },
          tiers, 4242, size, geo, 400,
        );
        expect(placed.length).toBeGreaterThan(0);

        const shellTop = tiers[0].y + tiers[0].height + shellThickness(tiers[0].radius);

        /*
         * The assertion is about the piece's *top*, not its origin, and that is the
         * whole point: a garnish is allowed — expected — to press into the frosting,
         * so its lowest point sits below the surface by design. What is never
         * acceptable is the whole piece being under it, which is what invisible
         * means. So: something has to stand proud.
         *
         * A tenth of the piece's own height, so the bar scales with the garnish
         * rather than asking a 1.3mm flake of gold leaf to clear the same absolute
         * distance as a 36mm strawberry.
         */
        const clearance = geo.height * size * 0.1;
        for (const p of placed) {
          const pieceTop = p.position.y + (geo.bottom + geo.height) * p.scale;
          expect(
            pieceTop,
            `${kind}/${placement}: top at ${pieceTop.toFixed(4)}, shell at ${shellTop.toFixed(4)}`,
          ).toBeGreaterThan(shellTop + clearance);
        }
      });
    }
  }

  /*
   * The other half, and the reason the lift is conditional. A naked or semi-naked
   * cake has no shell at all — Tier builds one only for `full` coverage (and for a
   * bundt, which is glazed) — so lifting by a thickness that is not there would
   * float the fruit above bare sponge.
   */
  for (const coverage of ["naked", "semi-naked", "top-only"] as Coverage[]) {
    it(`sits ${coverage} garnishes on the sponge, which is the real surface`, () => {
      const tiers = tierDims("1.5kg", 1, "round");
      const geo = toppingGeo("strawberry");
      const size = geo.scale * scaleForSize(tiers[0].radius);
      const spongeTop = tiers[0].y + tiers[0].height;
      const placed = place(
        { kind: "strawberry", placement: "top-ring", density: 3 },
        { ...DEFAULT_CAKE, size: "1.5kg", coverage, toppings: [] },
        tiers, 4242, size, geo, 400,
      );
      expect(placed.length).toBeGreaterThan(0);

      // Seated: some of the piece below the surface, most of it above.
      for (const p of placed) {
        expect(lowest(p, geo.bottom)).toBeLessThan(spongeTop);
        expect(p.position.y + (geo.bottom + geo.height) * p.scale)
          .toBeGreaterThan(spongeTop);
      }
    });
  }
});
