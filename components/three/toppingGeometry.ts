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

/**
 * A flat colour written into the geometry's own vertices.
 *
 * NOTE: the `convertSRGBToLinear` here is a double conversion — three's
 * ColorManagement is on, so `new THREE.Color(hex)` has already converted, and
 * running the transfer curve twice drives #B4783D to (0.176, 0.029, 0.004) where
 * the correct linear value is (0.456, 0.188, 0.047). Every tinted garnish
 * therefore renders darker and more saturated than the hex it names, and the
 * curve bites hardest on the weakest channel, so each one is dragged towards the
 * primary it already leaned on. Left alone here on purpose: TOPPING_COLORS was
 * chosen by eye against this, so removing it repaints the strawberry, the cherry,
 * the Oreo, the berries and the flower all at once and wants its own pass.
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
  // Double-converted, like `tint` — see the note there.
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

/**
 * A blueberry is the `berry` solid with a different palette, and that is the
 * whole of it — see materials.TOPPING_PALETTES.blueberry.
 *
 * Worth saying out loud rather than leaving as a coincidence: `mixed-berry`
 * already draws exactly this shape, and the only thing separating a punnet of
 * blueberries from a punnet of mixed berries is which four colours the instances
 * are drawn from. Giving the two kinds one builder means the weld-before-jitter
 * reasoning above is stated once and cannot drift between them.
 *
 * What it is *not* is a berry with a calyx. The five-point star on a blueberry's
 * crown is 2mm across on a 10mm fruit, which at the size one of these renders is
 * under a pixel — geometry that costs triangles to describe something no frame
 * will ever resolve.
 */

/**
 * A cherry: dimpled at the stem end, and with a stem.
 *
 * The stem is the entire reason this is not `berry` at a bigger scale and a
 * redder colour. A stoned cherry with no stem is a red sphere, and a red sphere
 * on white cream is a boiled sweet — the same failure the strawberry note above
 * is about, arrived at from the other direction. One leaning cylinder is ten
 * triangles and it is what makes the silhouette read as fruit from any angle,
 * which is what a turntable demands.
 *
 * Two colours, so it carries vertex colours: a green stem cannot come from an
 * instance tint that also has to make the fruit red.
 */
function cherry(): THREE.BufferGeometry {
  // Widest just under the middle, with the shoulders drawn in to a dimple at the
  // top — the asymmetry between the two ends is what says "cherry" and not "ball".
  const body = lathe([
    [0.001, -0.30], [0.12, -0.293], [0.21, -0.272], [0.272, -0.233],
    [0.298, -0.172], [0.305, -0.09], [0.302, -0.008], [0.286, 0.072],
    [0.25, 0.136], [0.19, 0.181], [0.116, 0.199], [0.052, 0.186],
    [0.026, 0.166], [0.001, 0.163],
  ], 26);
  tint(body, TOPPING_COLORS.cherry);

  /* Translated and *then* rotated, in that order. Rotating about the origin after
     the lift is what gives the stem its lean while leaving its foot in the
     dimple; leaning first and lifting after would stand it up straight again. */
  const stem = new THREE.CylinderGeometry(0.016, 0.024, 0.30, 6, 1);
  stem.translate(0, 0.30, 0);
  stem.rotateZ(0.24);
  tint(stem, "#5E6B33");

  const parts = [body, stem];
  const g = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  g.computeVertexNormals();
  return g;
}

/**
 * A chunk cut off a pineapple ring: curved outer wall, two flat knife faces, and
 * the cored hole on the inside.
 *
 * Not a cube of fruit. A pineapple arrives as a ring and is cut down from one, so
 * every chunk has one convex face and one concave one — and that pair is what
 * distinguishes it from a diced mango or a cube of papaya at a glance. An arc
 * segment costs no more than a rounded box and carries the whole read.
 */
function pineappleChunk(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.5, -0.62, 0.62, false);
  s.absarc(0, 0, 0.17, 0.62, -0.62, true);
  s.closePath();

  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.3, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.028,
    bevelSegments: 2, curveSegments: 10,
  });
  /* Extrusion runs along +Z; a chunk lying on a cake wants it along +Y. A quarter
     turn about X takes +Z to +Y and lays the arc flat in the XZ plane. */
  g.rotateX(-Math.PI / 2);
  g.center();
  g.computeVertexNormals();
  return g;
}

/** A point on a rounded rectangle, with the normal and phase the crimp needs. */
interface Rib { x: number; y: number; nx: number; ny: number; t: number }

/**
 * A rounded rectangle sampled at *constant arc length*, each sample carrying the
 * outward normal it would have without a crimp on it and how far round the
 * perimeter it sits.
 *
 * Constant arc length rather than constant angle because the crimp has to have
 * the same pitch on the long side, the short side and the corner — a biscuit
 * mould cuts one tooth profile and runs it all the way round, so a wave that
 * stretches on the flats and bunches at the corners is the tell that this was
 * drawn rather than stamped.
 *
 * Phase is returned alongside the point so the border can be the *same* walk
 * pushed inward. Walking a second, smaller rectangle would be the obvious way to
 * get it and it does not work: a rectangle 3mm smaller has a shorter perimeter,
 * so thirty-six lobes around it land a whole lobe out of register with the edge
 * they are supposed to sit behind, and the border reads as a separate part that
 * was glued on crooked.
 */
function roundedWalk(w: number, h: number, r: number, n: number): Rib[] {
  const bx = 2 * (w - r), by = 2 * (h - r), arc = (Math.PI * r) / 2;
  const total = 2 * bx + 2 * by + 4 * arc;
  const out: Rib[] = [];

  const corner = (cx: number, cy: number, a0: number, d: number, t: number): Rib => {
    const a = a0 + d / r;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a), t };
  };

  // Anticlockwise from the left end of the bottom edge.
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let d = t * total;
    if (d < bx) { out.push({ x: -w + r + d, y: -h, nx: 0, ny: -1, t }); continue; }
    d -= bx;
    if (d < arc) { out.push(corner(w - r, -h + r, -Math.PI / 2, d, t)); continue; }
    d -= arc;
    if (d < by) { out.push({ x: w, y: -h + r + d, nx: 1, ny: 0, t }); continue; }
    d -= by;
    if (d < arc) { out.push(corner(w - r, h - r, 0, d, t)); continue; }
    d -= arc;
    if (d < bx) { out.push({ x: w - r - d, y: h, nx: 0, ny: 1, t }); continue; }
    d -= bx;
    if (d < arc) { out.push(corner(-w + r, h - r, Math.PI / 2, d, t)); continue; }
    d -= arc;
    if (d < by) { out.push({ x: -w, y: h - r - d, nx: -1, ny: 0, t }); continue; }
    d -= by;
    out.push(corner(-w + r, -h + r, Math.PI, d, t));
  }
  return out;
}

/** A walk pushed along its own outward normals by however much `off` says. */
function contour(ribs: Rib[], off: (t: number) => number): THREE.Shape {
  const s = new THREE.Shape();
  ribs.forEach((p, i) => {
    const k = off(p.t);
    const x = p.x + p.nx * k, y = p.y + p.ny * k;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  });
  /* No closePath. ExtrudeGeometry wraps the contour itself, and the closing line
     leaves the first point in the list twice, which is a degenerate wall quad per
     shape — invisible, but there are a hundred and forty of them here. */
  return s;
}

/**
 * A monoline stroke: a curve walked, offset both ways, closed into a ribbon.
 *
 * Which is what script lettering *is* — a round tip dragged along a path at one
 * width — so the letters below are authored as centrelines rather than as
 * outlines. That halves the coordinates and makes the weight a single number
 * instead of two points per node, which matters when the whole alphabet is being
 * typed out by hand. MessagePlaque makes the same argument about choosing a
 * monoline face for piping; this is the argument with no font in it.
 */
function ribbon(pts: Array<[number, number]>, width: number, segs = 10): THREE.Shape {
  const p = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(segs);
  const half = width / 2;
  const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];

  for (let i = 0; i < p.length; i++) {
    // Central difference, clamped at the ends: the tangent at a node is the
    // direction between its neighbours, which is stable where a one-sided
    // difference kicks at every change of curvature.
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    left.push(new THREE.Vector2(p[i].x - t.y * half, p[i].y + t.x * half));
    right.push(new THREE.Vector2(p[i].x + t.y * half, p[i].y - t.x * half));
  }

  /* Square caps. A round one is four more points on a stroke a millimetre wide,
     and no camera this scene has ever used could resolve the difference. */
  const s = new THREE.Shape();
  left.concat(right.reverse()).forEach((q, i) => (i ? s.lineTo(q.x, q.y) : s.moveTo(q.x, q.y)));
  return s;
}

/** The one closed letter. An annulus, because a stroke that meets itself is one. */
function loop(cx: number, cy: number, rx: number, ry: number, width: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(cx, cy, rx + width / 2, ry + width / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absellipse(cx, cy, rx - width / 2, ry - width / 2, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

/**
 * "Lotus", raised across the middle of the biscuit.
 *
 * Drawn rather than typeset, and that is the decision worth defending. There is a
 * canvas-and-bundled-font route already in this project — MessagePlaque draws the
 * customer's message with Style Script and hands the canvas to three as a colour
 * and bump map — and it is the wrong tool three times over here. It would want a
 * custom UVGenerator, because ExtrudeGeometry's default writes cap UVs in shape
 * coordinates and reuses them on the side walls, so the word would smear down the
 * edges and print mirrored on the underside. It would want the font-ready gate
 * MessagePlaque needs, because a canvas silently draws whatever is resolvable at
 * the moment fillText runs. And it could not coexist with the crumb map: three
 * takes a normal map over a bump map rather than compositing the two, so the word
 * would cost the surface that stops this biscuit reading as plastic.
 *
 * Against all that, the thing it buys is real letterforms — and no face in the
 * project is the Lotus face, so a typeset word would be an approximation of the
 * wordmark as surely as this is. Given two approximations, take the one that is
 * forty lines in the module that already builds everything from primitives, and
 * that self-shadows because it is geometry.
 *
 * Authored in ems: x-height 1, baseline 0, and the layout centred by hand rather
 * than measured, because the coordinates are right here and a bounding box pass
 * would only re-derive what they already say.
 */
function wordmark(): THREE.BufferGeometry[] {
  /* A 6.6mm x-height on a 62mm biscuit, with the capital reaching 10.6mm across a
     25mm width and the word spanning just under half the length. Large, and that
     is the size Lotus print it — the wordmark is most of why the thing is
     recognisable at arm's length, so it is not a detail to be tasteful about. */
  const EM = 0.107, CX = 2.06, CY = 0.76;
  const STROKE = 0.22 * EM;
  const at = (p: Array<[number, number]>): Array<[number, number]> =>
    p.map(([x, y]) => [(x - CX) * EM, (y - CY) * EM]);
  const [ox, oy] = at([[1.28, 0.5]])[0];

  /*
   * Upright and wide-set, where the first pass at this was a connected script.
   * Cursive is the truer answer to what Lotus actually print and it was the wrong
   * one: at 6mm of x-height the joins close up, the counters fill, and five
   * letters render as one squiggle that says a word is there without saying which.
   * Spread the same letters across half the biscuit's length instead of a third,
   * keep them separate, and take the stroke up from 1.1mm to 1.4mm — legible beats
   * faithful when the alternative is neither.
   */
  const letters = [
    // L: a stem that turns through a corner into its foot, rather than a swash.
    ribbon(at([[0.10, 1.50], [0.10, 0.30], [0.14, 0.10], [0.30, 0.02], [0.58, 0.02]]), STROKE),
    loop(ox, oy, 0.28 * EM, 0.38 * EM, STROKE),
    // t: stem and tail. The bar is below, on its own, for the depth-buffer reason.
    ribbon(at([[2.20, 1.42], [2.20, 0.28], [2.26, 0.08], [2.42, 0.04]]), STROKE),
    ribbon(at([[2.76, 1.00], [2.76, 0.32], [2.84, 0.08], [3.02, 0.02],
               [3.20, 0.08], [3.28, 0.32], [3.28, 1.00]]), STROKE),
    ribbon(at([[4.02, 0.78], [3.96, 0.96], [3.78, 1.00], [3.66, 0.86], [3.70, 0.68],
               [3.88, 0.56], [4.02, 0.42], [4.00, 0.14], [3.84, 0.02], [3.66, 0.10]]), STROKE),
  ];

  const opts = {
    depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.0035,
    /* Only the `o` reads this, and an ellipse it subdivides twice over: eight
       gives that counter a sixteen-sided outline, which at 6mm is smooth. */
    bevelSegments: 1, curveSegments: 8,
  };
  const body = new THREE.ExtrudeGeometry(letters, opts);
  body.translate(0, 0, 0.0775);

  /* The bar crosses the stem, and two shapes in one ExtrudeGeometry are each
     capped at the same depth — so where they overlap there would be two coplanar
     top faces fighting for the depth buffer, which flickers on a turntable. Half
     a tenth of a millimetre lower settles it and is not a height anything can
     see. */
  const bar = new THREE.ExtrudeGeometry(ribbon(at([[1.98, 0.92], [2.46, 0.92]]), STROKE, 1), opts);
  bar.translate(0, 0, 0.0767);

  return [body, bar];
}

/**
 * A speculoos biscuit: crimped edge, raised fluted border, flat centre.
 *
 * This was a plain rounded rectangle, on the argument that the stamp on a real
 * Lotus biscuit is under half a millimetre deep and so falls below a pixel at the
 * size one of these renders. The depth was the wrong dimension to measure. What
 * makes that biscuit recognisable is how *wide* its features are, not how deep:
 * the edge is crimped every 4mm and the border band is 2mm across, which on a
 * 60mm biscuit is 6% and 3% of its length — twelve pixels and six at the couple
 * of hundred one gets on a card. Both resolve. Only the depth does not, and depth
 * is the one part a bevel can fake, because a rounded ridge catching the key
 * light along its length is what the eye actually reads an emboss by.
 *
 * So the outline undulates instead of being smooth, and a ring is merged proud of
 * the slab instead of the top being one flat face. Proportion goes to life as
 * well: 2.5 to 1, where it was 2.2.
 *
 * The word is `wordmark`, above, and is drawn rather than typeset for the reasons
 * given there.
 */
function biscuit(): THREE.BufferGeometry {
  const W = 0.5, H = 0.2, R = 0.072, LOBES = 44;
  const ribs = roundedWalk(W, H, R, LOBES * 4);

  /* Half a millimetre of crimp, and it cannot be much more. ExtrudeGeometry
     bevels by offsetting each contour point along its bisector, so a bevel wider
     than the tightest concave radius on the outline folds that offset polygon
     through itself and the edge comes out as crossed slivers. A cosine of
     amplitude a and wavelength L bottoms out at a radius of 1/(a(2*pi/L)^2),
     which is 0.013 for the pair below against a bevel of 0.008 — and that margin
     is what the two of them are for. Deepen the crimp and the bevel comes down
     with it. */
  const crimp = (t: number) => Math.cos(t * LOBES * Math.PI * 2) * 0.007;

  const slab = new THREE.ExtrudeGeometry(contour(ribs, crimp), {
    depth: 0.07, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.011,
    bevelSegments: 1,
  });

  const band = contour(ribs, t => crimp(t) - 0.012);
  // Plain inside edge: only the outer boundary of the band is fluted. The hole
  // gets its own rectangle rather than a fourth offset of the walk because an
  // inward offset takes the corner radius down with it — 0.04 off a 0.072 corner
  // leaves 0.032, and a band any wider than this would drive it through zero and
  // turn every corner inside out.
  band.holes.push(contour(roundedWalk(W - 0.04, H - 0.04, 0.032, 48), () => 0));

  const rim = new THREE.ExtrudeGeometry(band, {
    depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.005,
    bevelSegments: 1,
  });
  /* Ten thousandths of it buried in the slab, so the join never shows and the
     only part standing proud is the upper bevel — an emboss on a moulded biscuit
     is a rounded swell, with no vertical wall anywhere on it. */
  rim.translate(0, 0, 0.076);

  const parts = [slab, rim, ...wordmark()];
  const g = mergeGeometries(parts, false)!;
  parts.forEach(p => p.dispose());
  g.rotateX(-Math.PI / 2);
  g.center();
  g.computeVertexNormals();
  return g;
}

/**
 * A shelled pistachio kernel — flattened, because the shell pressed it flat.
 *
 * A solid of revolution would be an olive. Squashing one axis to 0.72 before it
 * is laid down is one line and it is the difference between a nut and a bead.
 */
function pistachioNut(): THREE.BufferGeometry {
  const g = lathe([
    [0.001, -0.34], [0.10, -0.318], [0.168, -0.268], [0.208, -0.182],
    [0.224, -0.062], [0.224, 0.062], [0.208, 0.172], [0.16, 0.26],
    [0.09, 0.318], [0.001, 0.34],
  ], 18);
  g.scale(1, 1, 0.72);
  g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Blanched and shaved: a long, thin, slightly bowed flake. */
function almondSliver(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.quadraticCurveTo(-0.08, 0.125, 0.5, 0.028);
  s.quadraticCurveTo(-0.08, -0.045, -0.5, 0);
  s.closePath();

  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.035, bevelEnabled: true, bevelSize: 0.009, bevelThickness: 0.007,
    bevelSegments: 1, curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.center();
  g.computeVertexNormals();
  return g;
}

/**
 * A rasmalai patty: chenna pressed flat and left to soak, so the rim is rounded
 * and the faces sag rather than sitting parallel.
 *
 * The near-flat top is the point. A cylinder of the same proportions reads as a
 * marshmallow; a cushion with a fat rounded edge and a slightly domed face reads
 * as something that was squeezed by hand and then swelled in milk.
 */
function rasmalaiDisc(): THREE.BufferGeometry {
  return lathe([
    [0.001, -0.13], [0.18, -0.136], [0.34, -0.129], [0.44, -0.105],
    [0.485, -0.061], [0.5, 0], [0.485, 0.061], [0.44, 0.106],
    [0.34, 0.132], [0.18, 0.141], [0.001, 0.144],
  ], 26);
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
  /* The same solid as `mixed-berry`, one shade rounder in scale and drawn from a
     palette of blues. 0.15 × 0.72 units of geometry is 9.8mm across, which is a
     blueberry; the mixed punnet runs a hair smaller because a third of it is
     raspberry drupelets. */
  blueberry: () => ({ build: berry, vertexColors: false, scale: 0.15, flat: false, sink: 0.2 }),
  /* Stem up. `flat` is what keeps it that way: a cherry dropped at a random
     orientation lies on its side with the stem sticking out sideways, which is
     the one pose a bakery never puts a cherry in. */
  cherry: () => ({ build: cherry, vertexColors: true, scale: 0.34, flat: true, sink: 0.2 }),
  "pineapple-chunk": () => ({ build: pineappleChunk, vertexColors: false, scale: 0.3, flat: true, sink: 0.34 }),
  "chocolate-shard": () => ({ build: shard, vertexColors: false, scale: 0.34, flat: false, sink: 0.14 }),
  "chocolate-curl": () => ({ build: curl, vertexColors: false, scale: 0.24, flat: true, sink: 0.12 }),
  "white-chocolate-curl": () => ({ build: curl, vertexColors: false, scale: 0.24, flat: true, sink: 0.12 }),
  /* A truffle and a Ferrero are the same rolled ball: same builder, same size.
     Everything that separates them is in the material — cocoa dust against gold
     foil — see materials.TOPPING_MATERIALS.truffle. */
  truffle: () => ({ build: ferrero, vertexColors: false, scale: 0.24, flat: false, sink: 0.14 }),
  "caramel-shard": () => ({ build: shard, vertexColors: false, scale: 0.32, flat: false, sink: 0.16 }),
  "butterscotch-crunch": () => ({ build: crumb, vertexColors: false, scale: 0.13, flat: false, sink: 0.3 }),
  /*
   * Laid flat and barely pressed in. A biscuit standing on edge is what happens
   * when a piece this long is dropped at a random angle, and half of them end up
   * leaning on nothing — see the `flat` note on ToppingGeo.
   *
   * The largest garnish in the catalogue, at 42mm across, and it has to be: at
   * 0.34 it measured 28mm long by 11mm wide, which on a 200mm cake top is a speck,
   * and a `sink` of 0.3 then put a third of that speck inside the cream. It read
   * as three small brown rectangles printed on the frosting rather than as
   * biscuits laid on it. A Lotus biscuit is 60mm in life; this is the one piece
   * where the catalogue's usual half-life-size convention makes the subject
   * unrecognisable, because the biscuit *is* the whole flavour's signature.
   */
  "biscoff-biscuit": () => ({ build: biscuit, vertexColors: false, scale: 0.46, flat: true, sink: 0.14 }),
  /* Worth saying where the next person will look for it: this is by a distance
     the most expensive garnish in the catalogue, around 4,200 triangles against
     1,400 for the strawberry and under 200 for most of the rest. Two thirds of it
     is the crimped outline, which needs four samples a lobe to stay a symmetric
     wave rather than a sawtooth, and it is paid once — these are instanced, and a
     preset places five of them. If a low tier ever needs a cheap one, the lever is
     a plain outline and no wordmark, not a coarser crimp. */
  "biscoff-crumb": () => ({ build: crumb, vertexColors: false, scale: 0.14, flat: false, sink: 0.3 }),
  macaron: () => ({ build: macaron, vertexColors: false, scale: 0.27, flat: true, sink: 0.07 }),
  "meringue-kiss": () => ({ build: meringue, vertexColors: false, scale: 0.22, flat: true, sink: 0.08 }),
  "rasmalai-disc": () => ({ build: rasmalaiDisc, vertexColors: false, scale: 0.28, flat: true, sink: 0.24 }),
  // Laid on with a brush: it takes the shape of whatever is under it.
  "gold-leaf": () => ({ build: goldLeaf, vertexColors: false, scale: 0.16, flat: true, sink: 0.45 }),
  sprinkles: () => ({ build: sprinkle, vertexColors: false, scale: 0.13, flat: false, sink: 0.3 }),
  "pistachio-crumb": () => ({ build: crumb, vertexColors: false, scale: 0.12, flat: false, sink: 0.3 }),
  "pistachio-nut": () => ({ build: pistachioNut, vertexColors: false, scale: 0.26, flat: false, sink: 0.26 }),
  /*
   * 0.2, not the 0.42 this started at.
   *
   * The reasoning for a deep sink was sound and the number was not: a sliver is
   * 1.4mm thick, and pressing 42% of 1.4mm into cream leaves 0.8mm standing
   * proud, which at this camera is under a pixel. Rendered, they vanished
   * completely. A fifth is enough to seat it and still leave an almond above the
   * surface for the light to catch an edge on.
   */
  "almond-sliver": () => ({ build: almondSliver, vertexColors: false, scale: 0.28, flat: true, sink: 0.2 }),
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
