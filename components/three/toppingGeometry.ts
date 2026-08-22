import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Topping } from "@/lib/schema";
import { mulberry32 } from "@/lib/seed";
import { TOPPING_COLORS } from "./materials";

/**
 * One small geometry per topping, built from primitives and instanced. Nothing
 * here is loaded from disk — a configurator that ships a model per garnish
 * cannot support arbitrary combinations.
 */

function tint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function lathe(pts: [number, number][], segments = 20): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0.0005, x), y)), segments);
  g.computeVertexNormals();
  return g;
}

/**
 * Achenes: a scatter of vertices tinted paler and pressed in along their own
 * normal, which is the only fidelity a strawberry seed needs at the size one of
 * these gets rendered.
 *
 * The dimple matters more than the colour, and that is not obvious. A smooth dome
 * of any red is a boiled sweet: one unbroken specular lobe with nothing on the
 * surface for it to catch on, and no amount of tinting fixes it, because the tell
 * is in the *shading* rather than in the hue. Pushing the same vertices a
 * hundredth of a unit inward stipples that lobe, and a stippled highlight over
 * red is read as fruit.
 *
 * Smooth shading is what makes both halves work. A lathe is indexed, so one
 * altered vertex bleeds across the four quads that share it and lands as a soft
 * pit rather than a flat facet. The hash is taken from the rounded position
 * rather than from the vertex index, because the two coincident copies of the
 * lathe's seam must get the same answer or a crease runs down the side.
 */
function speckle(
  g: THREE.BufferGeometry,
  base: string, fleck: string, share: number, dimple: number,
): THREE.BufferGeometry {
  const a = new THREE.Color(base).convertSRGBToLinear();
  const b = new THREE.Color(fleck).convertSRGBToLinear();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const key = (Math.round(pos.getX(i) * 1e3) * 73856093)
      ^ (Math.round(pos.getY(i) * 1e3) * 19349663)
      ^ (Math.round(pos.getZ(i) * 1e3) * 83492791);
    const achene = mulberry32(key)() < share;

    const c = achene ? b : a;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    if (achene) {
      pos.setXYZ(
        i,
        pos.getX(i) - nor.getX(i) * dimple,
        pos.getY(i) - nor.getY(i) * dimple,
        pos.getZ(i) - nor.getZ(i) * dimple,
      );
    }
  }

  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Halved and glazed, cut face down — which is what the catalogue has always
 * promised and what a kitchen actually does with a strawberry.
 *
 * It was a whole berry standing tip up, and that is the wrong silhouette at the
 * size one gets rendered at. Seven lathe points taper in straight segments to a
 * point of radius 0.001, so a ring of them on a pale cake reads as claws rather
 * than as fruit. Size was the other half of it: 15mm from base to tip is under
 * half the length of any strawberry that has ever been picked, and something
 * that small can only read as a spike.
 *
 * A half lying face down is the opposite silhouette — a broad dome with a nose,
 * presenting its lit top to the camera instead of a shadowed flank. It is built
 * as the whole solid of revolution, laid on its side, and seated at `sink` 0.53
 * so the frosting line falls almost exactly where the knife did. The buried half
 * costs a few hundred triangles and saves capping a half-lathe — and it is what
 * keeps the piece looking seated when a placement tilts it, because there is
 * always solid under the cut face rather than the inside of an open shell.
 */
function strawberry(): THREE.BufferGeometry {
  // Long axis in y while it is turned. Widest a third of the way down from the
  // shoulder, then tapering to a rounded nose: a berry rather than an egg.
  const g = lathe([
    [0.001, -0.5], [0.11, -0.498], [0.20, -0.492], [0.27, -0.482],
    [0.33, -0.465], [0.372, -0.44], [0.398, -0.40], [0.409, -0.35],
    [0.412, -0.28], [0.408, -0.20], [0.40, -0.10], [0.388, 0],
    [0.37, 0.10], [0.34, 0.20], [0.30, 0.29], [0.25, 0.37],
    [0.19, 0.43], [0.13, 0.47], [0.07, 0.492], [0.001, 0.5],
  ], 36);
  g.rotateZ(Math.PI / 2);
  /*
   * The colour comes from materials.TOPPING_COLORS rather than from a hex here.
   * A garnish that carries vertex colours ignores its material colour, so this
   * one had two reds in two files and only one of them did anything.
   *
   * Lifted from #C93C42. Under ACES the green and blue channels of that red land
   * at four percent of linear, which is a colour with no shadow side: every
   * surface not facing the key went to black and the fruit read as a hole cut in
   * the frosting.
   *
   * The flecks are the achenes. They were cream (#EBD3A8) at 22% of vertices and
   * that is not what a seed looks like from a metre away — it is what mould looks
   * like from a metre away. A twentieth of a lathe ring is a large piece of a
   * berry, so a high-contrast fleck is a splotch however small the share; the
   * lathe is finer now and the fleck barely lighter than the skin, which is the
   * faint stipple the eye actually reads at this distance.
   */
  return speckle(g, TOPPING_COLORS.strawberry, "#E08874", 0.15, 0.013);
}

function berry(): THREE.BufferGeometry {
  /*
   * Welded before the normals are computed, and that is the whole trick.
   *
   * `IcosahedronGeometry` is non-indexed — every triangle carries its own three
   * vertices — so `computeVertexNormals` has no neighbours to average and hands
   * back one flat normal per face. On a twenty-face solid the size of a
   * blueberry that is not a berry, it is a cut gemstone, and on a dark chocolate
   * cake a dozen of them read as costume jewellery rather than fruit.
   *
   * `mergeVertices` indexes the shared corners first, so the same call averages
   * across faces and the lumps come back as a soft, slightly irregular sphere.
   *
   * The weld has to come *before* the jitter, which is not the intuitive order.
   * Jittering first draws a fresh random scale for each of the 240 loose vertices
   * — including the three separate copies of every shared corner — so the copies
   * move apart and the weld, which matches on position, finds nothing to join and
   * silently returns the same faceted solid.
   */
  const raw = new THREE.IcosahedronGeometry(0.36, 1);
  const g = mergeVertices(raw);
  raw.dispose();

  const pos = g.attributes.position as THREE.BufferAttribute;
  const rng = mulberry32(0x51ed270b);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.92 + rng() * 0.16;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.92, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;

  g.computeVertexNormals();
  return g;
}

/** Tempered sheets, snapped by hand — irregular, not a rectangle. */
function shard(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.34, -0.5);
  s.lineTo(0.3, -0.44);
  s.lineTo(0.36, 0.16);
  s.lineTo(0.05, 0.5);
  s.lineTo(-0.3, 0.28);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.008, bevelSegments: 1,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

/** Scraped from a warmed block: a short curled ribbon, lying on its side. */
function curl(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.06, 0);
  shape.lineTo(0.06, 0);
  shape.lineTo(0.06, 0.02);
  shape.lineTo(-0.06, 0.02);
  shape.closePath();

  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const a = t * Math.PI * 1.7;
    const r = 0.34 - t * 0.1;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 0.5) * 0.06, Math.sin(a) * r));
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    extrudePath: new THREE.CatmullRomCurve3(pts),
    steps: 30,
    bevelEnabled: false,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

/** Two footed shells with a filling band. */
function macaron(): THREE.BufferGeometry {
  // Flat-ish shells with the ruffled foot at the join. A sphere reads as an egg.
  return lathe([
    [0.001, -0.2], [0.3, -0.18], [0.44, -0.1], [0.46, -0.045],
    [0.5, -0.02], [0.5, 0.02], [0.46, 0.045], [0.44, 0.1],
    [0.3, 0.18], [0.001, 0.2],
  ], 28);
}

/** Piped and dried overnight: a swirled teardrop. */
function meringue(): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const r = Math.sin(Math.PI * (0.06 + t * 0.9)) * (1 - t * 0.72) * 0.46;
    pts.push([r, t * 0.9 - 0.42]);
  }
  const g = lathe(pts, 20);
  // A gentle spiral, so it reads as piped rather than turned.
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = y * 3.4;
    pos.setX(i, x * Math.cos(a) - z * Math.sin(a));
    pos.setZ(i, x * Math.sin(a) + z * Math.cos(a));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** 23-carat, applied with a brush: a crumpled flake. */
function goldLeaf(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.5, 0.42, 4, 4);
  const rng = mulberry32(0x2f9c1a77);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, (rng() - 0.5) * 0.09);
    pos.setX(i, pos.getX(i) * (0.8 + rng() * 0.4));
  }
  pos.needsUpdate = true;
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

function sprinkle(): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(0.09, 0.34, 3, 8);
  g.computeVertexNormals();
  return g;
}

function crumb(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.24, 0);
  const rng = mulberry32(0x77c1e3a1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.6 + rng() * 0.8), pos.getY(i) * (0.4 + rng() * 0.5), pos.getZ(i) * (0.6 + rng() * 0.8));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function flower(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.bezierCurveTo(0.16, 0.1, 0.2, 0.36, 0, 0.5);
  petalShape.bezierCurveTo(-0.2, 0.36, -0.16, 0.1, 0, 0);

  for (let i = 0; i < 6; i++) {
    const p = new THREE.ExtrudeGeometry(petalShape, {
      depth: 0.012, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.008,
      bevelSegments: 1, curveSegments: 8,
    });
    p.rotateX(-Math.PI / 2 + 0.28);
    p.rotateY((i / 6) * Math.PI * 2);
    tint(p, "#D18AA4");
    parts.push(p);
  }

  // Extruded petals are non-indexed; the sphere is not. Merge needs one or the other.
  const sphere = new THREE.SphereGeometry(0.1, 12, 8);
  const centre = sphere.toNonIndexed();
  sphere.dispose();
  centre.translate(0, 0.06, 0);
  tint(centre, "#E0B547");
  parts.push(centre);

  const g = mergeGeometries(parts, false)!;
  parts.forEach(p => p.dispose());
  g.computeVertexNormals();
  return g;
}

function oreo(): THREE.BufferGeometry {
  const disc = (y: number) => {
    const d = new THREE.CylinderGeometry(0.42, 0.42, 0.11, 26);
    d.translate(0, y, 0);
    return tint(d, "#3A2E28");
  };
  const cream = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 26);
  tint(cream, "#EFE4CE");

  const parts = [disc(0.105), cream, disc(-0.105)];
  const g = mergeGeometries(parts, false)!;
  parts.forEach(p => p.dispose());
  g.computeVertexNormals();
  return g;
}

function ferrero(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.4, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rng = mulberry32(0x1c8ad4f3);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.94 + rng() * 0.12;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export interface ToppingGeo {
  geometry: THREE.BufferGeometry;
  /** Geometry carries its own colours; do not also tint per instance. */
  vertexColors: boolean;
  /** World size of one piece, before the size multiplier. */
  scale: number;
  /** Sits flat on the surface rather than being dropped at a random angle. */
  flat: boolean;
  /**
   * The lowest point of the geometry in its own unit space.
   *
   * Every topping used to be placed at `surfaceY + size * 0.4` — one constant for
   * twelve garnishes whose origins sit in completely different places. A strawberry
   * runs from -0.5 to 0.4, so 0.4 buried nearly half of it, which is why they read
   * as red claws rather than as fruit; a flake of gold leaf is 0.09 tall in total,
   * so the same 0.4 left it hovering 6mm clear of the frosting. Knowing where a
   * piece's own bottom is lets it be *seated* rather than guessed at.
   */
  bottom: number;
  /** Height in unit space, which the sink below is a fraction of. */
  height: number;
  /**
   * How far the piece presses into the frosting, as a fraction of its own height.
   *
   * Nothing rests exactly on top of buttercream: something hard and heavy sinks a
   * little, something soft nestles, and gold leaf is laid onto the surface and
   * follows it. With no sink every garnish is tangent to the surface at exactly one
   * point, and that is the floating look.
   */
  sink: number;
}

type Builder = Omit<ToppingGeo, "geometry" | "bottom" | "height">
  & { build: () => THREE.BufferGeometry };

/**
 * `scale` is world size per piece and `sink` how deep it presses in.
 *
 * A strawberry at 0.26 was 24mm of real fruit on an 8in cake — bigger than any
 * strawberry that has ever been on a cake, and once seated properly rather than
 * half-buried it was unmissable. The berries, macarons and Oreos were all a shade
 * over life size for the same reason: they had been scaled up to stay visible while
 * half of each one was inside the frosting.
 */
const builders: Record<Topping, () => Builder> = {
  strawberry: () => ({ build: strawberry, vertexColors: true, scale: 0.4, flat: true, sink: 0.53 }),
  "mixed-berry": () => ({ build: berry, vertexColors: false, scale: 0.145, flat: false, sink: 0.16 }),
  "chocolate-shard": () => ({ build: shard, vertexColors: false, scale: 0.34, flat: false, sink: 0.14 }),
  "chocolate-curl": () => ({ build: curl, vertexColors: false, scale: 0.24, flat: true, sink: 0.12 }),
  macaron: () => ({ build: macaron, vertexColors: false, scale: 0.27, flat: true, sink: 0.07 }),
  "meringue-kiss": () => ({ build: meringue, vertexColors: false, scale: 0.22, flat: true, sink: 0.08 }),
  // Laid on with a brush: it takes the shape of whatever is under it.
  "gold-leaf": () => ({ build: goldLeaf, vertexColors: false, scale: 0.16, flat: true, sink: 0.45 }),
  sprinkles: () => ({ build: sprinkle, vertexColors: false, scale: 0.13, flat: false, sink: 0.3 }),
  "pistachio-crumb": () => ({ build: crumb, vertexColors: false, scale: 0.12, flat: false, sink: 0.3 }),
  "edible-flower": () => ({ build: flower, vertexColors: true, scale: 0.34, flat: true, sink: 0.22 }),
  oreo: () => ({ build: oreo, vertexColors: true, scale: 0.22, flat: true, sink: 0.1 }),
  ferrero: () => ({ build: ferrero, vertexColors: false, scale: 0.24, flat: false, sink: 0.12 }),
};

const cache = new Map<Topping, ToppingGeo>();

export function toppingGeo(kind: Topping): ToppingGeo {
  const hit = cache.get(kind);
  if (hit) return hit;

  const spec = builders[kind]();
  const geometry = spec.build();
  // Measured rather than declared: a builder that changes its profile should not
  // also have to remember to update a hand-written extent.
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;

  const made: ToppingGeo = {
    geometry,
    vertexColors: spec.vertexColors,
    scale: spec.scale,
    flat: spec.flat,
    sink: spec.sink,
    bottom: box.min.y,
    height: Math.max(1e-4, box.max.y - box.min.y),
  };
  cache.set(kind, made);
  return made;
}
