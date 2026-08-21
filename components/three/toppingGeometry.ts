import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Topping } from "@/lib/schema";
import { mulberry32 } from "@/lib/seed";

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

/** Whole and glazed, sitting on its shoulders with the tip up. */
function strawberry(): THREE.BufferGeometry {
  const body = lathe([
    [0.001, 0.4], [0.22, 0.26], [0.38, 0.04], [0.44, -0.14],
    [0.42, -0.3], [0.28, -0.4], [0.001, -0.43],
  ], 24);
  tint(body, "#C93C42");

  const calyx = lathe([
    [0.001, -0.42], [0.2, -0.45], [0.32, -0.46], [0.2, -0.49], [0.001, -0.5],
  ], 16);
  tint(calyx, "#4E6B34");

  const g = mergeGeometries([body, calyx], false)!;
  body.dispose(); calyx.dispose();
  g.computeVertexNormals();
  return g;
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
  strawberry: () => ({ build: strawberry, vertexColors: true, scale: 0.2, flat: true, sink: 0.1 }),
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
