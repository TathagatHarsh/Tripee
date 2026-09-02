import * as THREE from "three";
import type { Filling, Finish, Frosting, Sponge, Topping } from "@/lib/schema";
import { achievable, mix, shade } from "@/lib/color";
import {
  biscuitCrumb, creamNormal, frostingNormal, frostingRoughness, satinNormal, sheetNormal,
  spongeCrumb, spongeNormal,
} from "./noise";

/**
 * The eight rules, encoded:
 *  1. Never pure white, never pure black — see lib/color.ts clamps.
 *  2. Roughness stays between 0.35 and 0.75; only ganache and glaze go lower.
 *     CARBON COPY §5.3 makes this a hard floor rather than a guideline: 0.35 on
 *     every surface, with two sanctioned exceptions — dark ganache at 0.28 and
 *     gold leaf at 0.15. The frosting values below are the document's own table,
 *     and they are materially higher than what was here (whipped 0.58 → 0.85,
 *     American 0.46 → 0.70, Swiss 0.36 → 0.60, cream cheese 0.48 → 0.75). Every
 *     one of those was under the floor, and collectively they are the reason the
 *     cakes read as plastic. Mirror glaze is a third exception by necessity — it
 *     is a mirror by definition — but it sits at gold leaf's 0.15 rather than
 *     below it, so nothing in the scene is glossier than the brand's one metal.
 *  3. Every surface gets a normal map. 2–3% is enough.
 *  4/5. Handled by the lighting rig.
 *  6. Sheen with a warm sheenColor fakes subsurface warmth for free.
 *  7. Bevelled geometry — see geometry.ts.
 *  8. Saturation clamp before the colour reaches the material.
 *
 * Two additions, both aimed at the same tell:
 *
 *  9. A clearcoat is a *second*, smooth dielectric interface laid over the base
 *     one — varnish, cling film, a car bonnet. It is exactly right for ganache,
 *     which sets with a wet skin, and for mirror glaze, which is a mirror. It is
 *     exactly wrong for buttercream, which is one rough surface and nothing
 *     else. Every cream here carried 0.12–0.20 of it, and that lacquer — not the
 *     colour, not the roughness — is what read as plastic. Creams now place the
 *     highlight with `specularIntensity` instead, which brightens the one lobe
 *     they actually have rather than adding a second one they do not.
 * 10. Constant roughness gives a whole tier one unbroken specular lobe, which no
 *     real surface has. `roughnessBreakup` multiplies in a broad, shallow field
 *     (noise.frostingRoughness) so the highlight has something to catch on.
 */

export interface FrostingMaterialSpec {
  roughness: number;
  metalness: number;
  sheen: number;
  sheenColor: string;
  sheenRoughness: number;
  clearcoat: number;
  clearcoatRoughness?: number;
  normalScale: number;
  baseColor: string;
  /** Frostings that carry their own colour and ignore the picker. */
  fixedColor?: boolean;
  /** Index of refraction. Milk fats sit near 1.46; three's default 1.5 is glass. */
  ior?: number;
  /** Strength of the single dielectric highlight. Only meaningful without a clearcoat. */
  specularIntensity?: number;
  /** Tints that highlight. A white specular on brown chocolate reads as metal. */
  specularColor?: string;
  /** Off for glass-smooth surfaces, where a roughness field would be a lie. */
  roughnessBreakup?: boolean;
}

/**
 * Sheen is a *fabric* lobe. At 0.25–0.40 it puts a felt nap over the whole
 * surface, and a felt nap on a bumpy normal map is what made every cake here
 * read as a stuccoed wall rather than something you would eat. Frosting is a
 * dielectric with one broad, soft, slightly-off-centre specular. So: sheen down
 * to a whisper, roughness into the range where that specular actually forms,
 * and normalScale down by roughly 3× across the board.
 */
export const FROSTING_MATERIALS: Record<Frosting, FrostingMaterialSpec> = {
  "whipped-cream": {
    // The softest thing in the catalogue: air beaten into fat. Highest roughness,
    // weakest specular, and the most sheen — the one place where the fabric lobe
    // is telling the truth, because whipped cream really does scatter at the
    // silhouette the way a napped surface does.
    roughness: 0.85, metalness: 0,
    sheen: 0.16, sheenColor: "#FFEFD9", sheenRoughness: 0.9,
    clearcoat: 0, normalScale: 0.15, baseColor: "#F7F1E6",
    ior: 1.44, specularIntensity: 0.34, roughnessBreakup: true,
  },
  "american-buttercream": {
    roughness: 0.70, metalness: 0,
    sheen: 0.07, sheenColor: "#FFE9CC", sheenRoughness: 0.8,
    clearcoat: 0, normalScale: 0.11, baseColor: "#F3E7D3",
    ior: 1.46, specularIntensity: 0.5, roughnessBreakup: true,
  },
  "swiss-meringue": {
    // Meringue buttercream is the glossiest of the creams — it is emulsified, so
    // it takes a burnish off a hot palette knife that American never will. That
    // difference is worth keeping; it just belongs in the base lobe, not in a
    // lacquer over the top of it.
    roughness: 0.60, metalness: 0,
    sheen: 0.08, sheenColor: "#FFF2E0", sheenRoughness: 0.7,
    clearcoat: 0, normalScale: 0.09, baseColor: "#F5EADA",
    ior: 1.47, specularIntensity: 0.72, roughnessBreakup: true,
  },
  "cream-cheese": {
    roughness: 0.75, metalness: 0,
    sheen: 0.09, sheenColor: "#FFF0DC", sheenRoughness: 0.8,
    clearcoat: 0, normalScale: 0.12, baseColor: "#F8F0E2",
    ior: 1.45, specularIntensity: 0.46, roughnessBreakup: true,
  },
  "dark-ganache": {
    // Chocolate's own refractive index is high — cocoa butter is about 1.51 —
    // which is part of why set ganache looks *wet* rather than merely dark. The
    // specular is tinted warm: a neutral-white highlight on a brown dielectric
    // is the exact signature of a metal, and it is why the darkest render in the
    // lab used to read as painted steel at the top edge.
    roughness: 0.28, metalness: 0,
    sheen: 0, sheenColor: "#4A2C1A", sheenRoughness: 0.4,
    clearcoat: 0.42, clearcoatRoughness: 0.24,
    normalScale: 0.10, baseColor: "#3B2318", fixedColor: true,
    ior: 1.51, specularIntensity: 1, specularColor: "#FFEBD2",
    roughnessBreakup: true,
  },
  "milk-ganache": {
    roughness: 0.35, metalness: 0,
    sheen: 0, sheenColor: "#7A5236", sheenRoughness: 0.45,
    clearcoat: 0.36, clearcoatRoughness: 0.28,
    normalScale: 0.10, baseColor: "#6B4A32", fixedColor: true,
    ior: 1.5, specularIntensity: 1, specularColor: "#FFEEDA",
    roughnessBreakup: true,
  },
  "white-ganache": {
    roughness: 0.40, metalness: 0,
    sheen: 0.06, sheenColor: "#FFF6E8", sheenRoughness: 0.5,
    clearcoat: 0.3, clearcoatRoughness: 0.3,
    normalScale: 0.10, baseColor: "#EFE3CE",
    ior: 1.49, specularIntensity: 1, specularColor: "#FFF4E6",
    roughnessBreakup: true,
  },
  fondant: {
    // The old note here — "rolled fondant is matte and dead flat" — was half
    // right and the half it got wrong inverted the whole comparison. Flat is
    // about *surface*, not about roughness, and at 0.52 fondant was rougher than
    // the American buttercream next to it. That is backwards: sugar paste is
    // rolled and smoothed with an acetate, so it is the *smoother* of the two,
    // with one broad satin highlight and no texture whatsoever. Roughness comes
    // down to place that highlight; the normal scale stays at a whisper, which is
    // what "dead flat" actually meant.
    roughness: 0.4, metalness: 0,
    sheen: 0.05, sheenColor: "#FFF4E4", sheenRoughness: 0.85,
    clearcoat: 0, normalScale: 0.05, baseColor: "#F2EADC",
    ior: 1.48, specularIntensity: 0.62, roughnessBreakup: true,
  },
  "mirror-glaze": {
    // 0.06 gives razor-straight reflections of the lightformers, which reads as
    // CG. A touch more roughness keeps the mirror and loses the hard edge.
    //
    // Metalness 0.05 was doing nothing a real glaze does — a gelatine-set glaze
    // is a dielectric, and even 5% metal desaturates the diffuse underneath it.
    // The mirror comes from the clearcoat, so the metal can go.
    roughness: 0.15, metalness: 0,
    sheen: 0, sheenColor: "#FFF4E4", sheenRoughness: 0.5,
    clearcoat: 0.9, clearcoatRoughness: 0.08,
    normalScale: 0.06, baseColor: "#C4342A",
    ior: 1.52, specularIntensity: 1, roughnessBreakup: false,
  },
};

export const SPONGE_COLORS: Record<Sponge, string> = {
  vanilla: "#E8D4A8",
  "belgian-chocolate": "#4A3226",
  "red-velvet": "#8B2E20",
  butterscotch: "#D9A860",
  coffee: "#6B4E3A",
  lemon: "#EDDC9A",
  pineapple: "#E8DCA0",
  mango: "#E5C36A",
  saffron: "#E9CE78",
  carrot: "#C08A4E",
  pistachio: "#B8C48A",
  coconut: "#EFE6D2",
  marble: "#D6C09A",   // blended with chocolate in the shader-side tint
  funfetti: "#EDDFC4",
};

export const FILLING_COLORS: Record<Filling, string> = {
  none: "#F0E4CE",
  "strawberry-jam": "#A34049",
  "raspberry-compote": "#8E3547",
  "cherry-compote": "#7E2230",
  "blueberry-compote": "#3E3560",
  "pineapple-crush": "#DEBE62",
  "lemon-curd": "#E8C55C",
  "vanilla-custard": "#F0DCA6",
  rabri: "#EFDCA8",
  "chocolate-mousse": "#5A3A2A",
  "salted-caramel": "#B8813C",
  "biscoff-spread": "#B57A3E",
  nutella: "#5E3A28",
  "hazelnut-praline": "#8C5F38",
  "pistachio-cream": "#AFC183",
  "cookie-crumb": "#4A3A32",
  "fresh-fruit": "#C46A52",
};

export const TOPPING_COLORS: Record<Topping, string> = {
  /* Read by toppingGeometry.strawberry as its vertex base, not by the material:
     see the note there on what ACES does to the green and blue of a deeper red. */
  strawberry: "#D9463E",
  "mixed-berry": "#4F2A4C",
  blueberry: "#46538A",
  /* Deep, but not as deep as a cherry actually is — the same trap the strawberry
     note above describes. Under ACES a #7A1F2A cherry has a green channel at one
     percent of linear and no shadow side at all, so a bowl of them on white cream
     reads as a row of holes. Lifted until the unlit side still carries red, and
     the darkness put back with a clearcoat instead. */
  cherry: "#AE3A42",
  "pineapple-chunk": "#E0AF48",
  "chocolate-shard": "#3B2318",
  "chocolate-curl": "#4A3226",
  "white-chocolate-curl": "#E5D5B4",
  truffle: "#3B2419",
  "caramel-shard": "#C58A34",
  "butterscotch-crunch": "#C1863C",
  /* A shade deeper and browner than the #BE8146 this was. Speculoos is baked
     caramel, and at that value the rig's key light and envmap between them lifted
     it to a flat orange — the biscuits read as plastic tabs laid on the cream
     rather than as anything that had been in an oven. A topping colour has to be
     picked for what it looks like *lit*, not for what it looks like in a swatch.
     TOPPING_PALETTES["biscoff-crumb"] deliberately does not follow it down: crumb
     is fresh broken faces and scatters paler than the biscuit it came off. */
  "biscoff-biscuit": "#9E6631",
  "biscoff-crumb": "#B58453",
  macaron: "#E0A2B0",
  "meringue-kiss": "#F4E6D8",
  "rasmalai-disc": "#F8F2E2",
  "gold-leaf": "#C9A227",
  sprinkles: "#D96A82",
  "pistachio-crumb": "#8FA35C",
  "pistachio-nut": "#8FA351",
  "almond-sliver": "#E4D3B0",
  "edible-flower": "#D18AA4",
  oreo: "#2A2320",
  ferrero: "#8A6A3C",
};

/** Spread straight onto a `meshPhysicalMaterial`, so every field is a real prop. */
export interface MaterialProps {
  color: string;
  roughness: number;
  metalness: number;
  sheen: number;
  sheenColor: string;
  sheenRoughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  normalMap: THREE.Texture;
  normalScale: THREE.Vector2;
  envMapIntensity: number;
  /** Multiplies `color`. Carries tonal variation a normal map cannot. */
  map?: THREE.Texture;
  /** Multiplies `roughness`, so the specular is not one unbroken lobe. */
  roughnessMap?: THREE.Texture;
  ior?: number;
  specularIntensity?: number;
  specularColor?: string;
}

/**
 * The finish is what the customer chose and paid for, so the finish — not the
 * frosting — decides how much surface texture there is. "Smooth · scraped flat
 * with a bench scraper" and "Rustic · swirled with a palette knife" previously
 * shared one map and came out identical; the copy promised a difference the
 * render did not deliver.
 */
function normalFor(frosting: Frosting, finish: Finish): THREE.Texture {
  if (frosting === "fondant" || frosting === "mirror-glaze") return sheetNormal();

  // Combed ridges come from geometry, not from a stretched normal map — an
  // anisotropic map on a lathe puts a hard seam down one side. Between the
  // ridges the surface is scraped, so it wants the flat map.
  if (finish === "smooth" || finish === "ombre" || finish === "combed") return satinNormal();

  // Ruffles and rosettes carry all the detail as instanced geometry; texturing
  // the shell underneath them only adds noise behind the piping.
  if (finish === "ruffle" || finish === "rosette") return satinNormal();

  if (finish === "rustic" || frosting === "whipped-cream") return creamNormal();
  return frostingNormal();
}

/**
 * A cloned THREE.Texture gets a fresh uuid, so every clone is a separate GPU
 * upload — and nothing here ever disposed them. Changing frosting colour ten
 * times used to leave ten 512×512 RGBA textures resident. Repeat is the only
 * thing that varies, so cache on it.
 */
const tiledCache = new Map<string, THREE.Texture>();

function tiled(map: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const key = `${map.uuid}:${rx}:${ry}`;
  const hit = tiledCache.get(key);
  if (hit) return hit;

  const tex = map.clone();
  tex.repeat.set(rx, ry);
  tex.needsUpdate = true;
  tiledCache.set(key, tex);
  return tex;
}

/**
 * A lathe's UVs run 0–1 around the circumference and 0–1 along the profile, and
 * those are wildly different world lengths. A uniform repeat stretches the map
 * and the stretch shows up as vertical brush streaks down the side of the cake.
 */
export function frostingMaterial(
  frosting: Frosting,
  pickedColor: string,
  finish: Finish,
  repeat: number | [number, number] = 3,
): MaterialProps {
  const spec = FROSTING_MATERIALS[frosting];
  const color = spec.fixedColor ? spec.baseColor : achievable(pickedColor);

  const [rx, ry] = Array.isArray(repeat) ? repeat : [repeat, repeat];
  const tex = tiled(normalFor(frosting, finish), rx, ry);

  return {
    color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    sheen: spec.sheen,
    sheenColor: spec.sheenColor,
    sheenRoughness: spec.sheenRoughness,
    clearcoat: spec.clearcoat,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.4,
    normalMap: tex,
    normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
    // The break-up runs at a third of the normal map's tiling. Frosting is duller
    // where it is thick and wetter where the scraper burnished it, and those
    // patches are hand-sized — much broader than the surface texture sitting on
    // top of them. Matching the two repeats would just re-describe the bumps.
    roughnessMap: spec.roughnessBreakup
      ? tiled(frostingRoughness(), Math.max(1, Math.round(rx / 3)), Math.max(1, Math.round(ry / 3)))
      : undefined,
    ior: spec.ior,
    specularIntensity: spec.specularIntensity,
    specularColor: spec.specularColor,
    // 0.7 left the frosting lit almost entirely by the three directional lights,
    // which is flat. The environment is what puts a soft gradient down the side
    // of the cake and a highlight on the top edge.
    envMapIntensity: frosting === "mirror-glaze" ? 1.6 : 1.0,
  };
}

/** Ombré grades the colour from base to top; this is the base-end tint. */
export function ombreBase(hex: string): string {
  return shade(achievable(hex), -0.16);
}

export function ombreTop(hex: string): string {
  return shade(achievable(hex), +0.12);
}

/**
 * A crumb normal map shades the crumb but cannot stop the sponge being one flat
 * value, which is why a cut cake still read as a coloured cylinder with a bumpy
 * skin. The crumb *tone* map fixes that: open crumb reads darker than the cut
 * faces of the crumb walls, and that tonal difference is most of what makes a
 * sponge look baked rather than moulded.
 *
 * The tone map can only darken (see noise.luminanceMap), so the colour is lifted
 * by the map's own average first — otherwise every flavour would render a shade
 * muddier than the one named in SPONGE_COLORS.
 */
const CRUMB_LIFT = 0.07;

/**
 * The flavour's own colour, marble's blend included, and **without** CRUMB_LIFT.
 *
 * This is what a sponge surface should be painted when it is too small to carry
 * the crumb maps — the lift exists only to be cancelled by the tone map's average,
 * so a mapless surface that keeps it renders every flavour 7% pale. The loose
 * crumbs on the board are 1-3mm and sit inside a single cell of a map tiled for a
 * hundred, so they are exactly that case.
 */
export function spongeBaseColor(sponge: Sponge): string {
  const base = SPONGE_COLORS[sponge];
  return sponge === "marble" ? mix(base, SPONGE_COLORS["belgian-chocolate"], 0.28) : base;
}

export function spongeMaterial(
  sponge: Sponge,
  repeat: number | [number, number] = 4,
): MaterialProps {
  const blended = spongeBaseColor(sponge);

  const [rx, ry] = Array.isArray(repeat) ? repeat : [repeat, repeat];
  const tex = tiled(spongeNormal(), rx, ry);

  return {
    color: shade(blended, CRUMB_LIFT),
    map: tiled(spongeCrumb(), rx, ry),
    roughness: 0.90,
    metalness: 0,
    sheen: 0.12,
    sheenColor: "#FFE7C8",
    sheenRoughness: 0.9,
    clearcoat: 0,
    clearcoatRoughness: 0.5,
    normalMap: tex,
    normalScale: new THREE.Vector2(0.55, 0.55),
    ior: 1.42,
    specularIntensity: 0.22,
    envMapIntensity: 0.4,
  };
}

/**
 * Tile count that keeps one texture tile about `tile` world units on both axes.
 * Round and bundt tiers are lathes; everything else is extruded and already has
 * roughly world-scaled UVs.
 */
export function tileRepeat(
  shape: string,
  radius: number,
  height: number,
  tile = 1.5,
): [number, number] {
  if (shape === "round" || shape === "bundt") {
    const around = (Math.PI * 2 * radius) / tile;
    const along = (height + radius) / tile;   // lathe v runs the profile length
    return [Math.max(2, Math.round(around)), Math.max(1, Math.round(along))];
  }
  const n = Math.max(1, Math.round(1 / tile));
  return [n, n];
}

export function fillingMaterial(filling: Filling): MaterialProps {
  // Through `tiled` rather than a bare clone, for the reason given above it: a
  // clone is a fresh GPU upload that nothing ever disposes.
  const tex = tiled(frostingNormal(), 6, 2);

  return {
    color: FILLING_COLORS[filling],
    roughness: 0.55,
    metalness: 0,
    sheen: 0.2,
    sheenColor: "#FFE9CC",
    sheenRoughness: 0.6,
    clearcoat: 0.12,
    clearcoatRoughness: 0.4,
    normalMap: tex,
    normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 0.6,
  };
}

export interface ToppingMaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  sheen?: number;
  /** A thunk, so no texture is generated for a garnish nobody ordered. */
  normalMap?: () => THREE.Texture;
  normalScale?: number;
}

export const TOPPING_MATERIALS: Record<Topping, ToppingMaterialSpec> = {
  // Glaze is a thin wet skin, so it is a clearcoat rather than a low base
  // roughness — but at 0.5 over a smooth dome it was a broad blown white lobe,
  // which is the signature of moulded plastic. The dimpled skin from
  // toppingGeometry.speckle is what a glaze highlight needs to break over.
  strawberry: { color: TOPPING_COLORS.strawberry, roughness: 0.4, metalness: 0, clearcoat: 0.38 },
  "mixed-berry": { color: TOPPING_COLORS["mixed-berry"], roughness: 0.38, metalness: 0, clearcoat: 0.35 },
  /* Rougher and barely coated, which is the opposite of the other berries and is
     the whole of what makes a blueberry look like one: the bloom is a wax dust,
     so it scatters where a raspberry reflects. Sheen carries that dusty rim. */
  blueberry: { color: TOPPING_COLORS.blueberry, roughness: 0.52, metalness: 0, clearcoat: 0.16, sheen: 0.22 },
  // The shiniest fruit in the catalogue, and the gloss is doing the darkening
  // the base colour was not allowed to do. See the note in TOPPING_COLORS.
  cherry: { color: TOPPING_COLORS.cherry, roughness: 0.35, metalness: 0, clearcoat: 0.55 },
  "pineapple-chunk": { color: TOPPING_COLORS["pineapple-chunk"], roughness: 0.44, metalness: 0, clearcoat: 0.3 },
  "chocolate-shard": { color: TOPPING_COLORS["chocolate-shard"], roughness: 0.35, metalness: 0, clearcoat: 0.4 },
  "chocolate-curl": { color: TOPPING_COLORS["chocolate-curl"], roughness: 0.35, metalness: 0, clearcoat: 0.3 },
  "white-chocolate-curl": { color: TOPPING_COLORS["white-chocolate-curl"], roughness: 0.35, metalness: 0, clearcoat: 0.26 },
  /* The one chocolate here with no gloss at all. A truffle and a Ferrero are the
     same rolled ball — see toppingGeometry — so cocoa dust against gold foil is
     the entire difference between them, and it is a material difference. */
  truffle: { color: TOPPING_COLORS.truffle, roughness: 0.76, metalness: 0, clearcoat: 0 },
  // Set sugar is nearly glass: a hard, narrow highlight and a wet skin over it.
  "caramel-shard": { color: TOPPING_COLORS["caramel-shard"], roughness: 0.35, metalness: 0, clearcoat: 0.58 },
  "butterscotch-crunch": { color: TOPPING_COLORS["butterscotch-crunch"], roughness: 0.5, metalness: 0, clearcoat: 0.22 },
  /* The only topping with a normal map. Everything else in the catalogue is a
     small curved solid whose silhouette does the work; a biscuit is a flat plane
     held up to the key light, and a plane with a constant normal is plastic
     whatever colour it is. Roughness a shade up from the old 0.72 as well —
     speculoos is drier than that. */
  "biscoff-biscuit": {
    color: TOPPING_COLORS["biscoff-biscuit"], roughness: 0.78, metalness: 0, clearcoat: 0,
    normalMap: biscuitCrumb, normalScale: 0.45,
  },
  "biscoff-crumb": { color: TOPPING_COLORS["biscoff-crumb"], roughness: 0.82, metalness: 0, clearcoat: 0 },
  macaron: { color: TOPPING_COLORS.macaron, roughness: 0.68, metalness: 0, clearcoat: 0.05, sheen: 0.3 },
  "meringue-kiss": { color: TOPPING_COLORS["meringue-kiss"], roughness: 0.62, metalness: 0, clearcoat: 0.06, sheen: 0.35 },
  // Soaked in sweetened milk and never dried, so it is wet rather than merely
  // pale — the sheen is the milk still sitting on it.
  "rasmalai-disc": { color: TOPPING_COLORS["rasmalai-disc"], roughness: 0.35, metalness: 0, clearcoat: 0.34, sheen: 0.26 },
  // §5.3: "genuinely metallic, roughness 0.15. The one place metal is allowed in
  // this brand." Both halves of that are load-bearing — see `ferrero` below.
  "gold-leaf": { color: TOPPING_COLORS["gold-leaf"], roughness: 0.15, metalness: 0.95, clearcoat: 0 },
  sprinkles: { color: TOPPING_COLORS.sprinkles, roughness: 0.42, metalness: 0, clearcoat: 0.3 },
  "pistachio-crumb": { color: TOPPING_COLORS["pistachio-crumb"], roughness: 0.8, metalness: 0, clearcoat: 0 },
  "pistachio-nut": { color: TOPPING_COLORS["pistachio-nut"], roughness: 0.6, metalness: 0, clearcoat: 0.1 },
  "almond-sliver": { color: TOPPING_COLORS["almond-sliver"], roughness: 0.66, metalness: 0, clearcoat: 0.06 },
  "edible-flower": { color: TOPPING_COLORS["edible-flower"], roughness: 0.62, metalness: 0, clearcoat: 0.08, sheen: 0.4 },
  oreo: { color: TOPPING_COLORS.oreo, roughness: 0.74, metalness: 0, clearcoat: 0 },
  // Metalness 0.15 was a fifth of a conductor on a foil-wrapped ball, and gold
  // leaf is the only metal this brand allows (§5.3). The foil read comes from the
  // clearcoat and the colour instead; 0.15 metal only desaturated the diffuse.
  ferrero: { color: TOPPING_COLORS.ferrero, roughness: 0.44, metalness: 0, clearcoat: 0.25 },
};

/** Sprinkles and mixed berries need more than one colour to read right. */
export const TOPPING_PALETTES: Partial<Record<Topping, string[]>> = {
  sprinkles: ["#D9556E", "#E8A93C", "#7FA9D6", "#8FBF7A", "#F0E4D2"],
  "mixed-berry": ["#3F2A52", "#8E2340", "#4A2338", "#5E3A66"],
  /* Four blues rather than one. A punnet of blueberries is never one colour —
     they ripen at different rates and the bloom sits unevenly — and a ring of
     identical spheres is the single loudest tell that something was instanced. */
  blueberry: ["#46538A", "#3A4675", "#535F97", "#2F3C68"],
  "pineapple-chunk": ["#E0AF48", "#D6A23A", "#E8C169"],
  truffle: ["#3B2419", "#48301F", "#32200F"],
  "butterscotch-crunch": ["#C1863C", "#AE7430", "#D19E58"],
  /* Follows the whole biscuit down, but not all the way. Crumb is fresh broken
     faces and scatters paler than the baked outside it came off, so the three of
     these stay a step lighter than TOPPING_COLORS["biscoff-biscuit"] — what they
     cannot be is a different biscuit, which is what they became when the biscuit
     was deepened and this was left at its old value. */
  "biscoff-crumb": ["#B58453", "#A17140", "#C4986C"],
  /* Darker than the pistachio frosting they sit on, deliberately. At #A6BC70
     these were within a few percent of `pistacho`'s own #B6C79B coat and the ring
     of them disappeared into it — a garnish has to be a different value from the
     surface it is garnishing, and on a pale cake that means going down. */
  "pistachio-nut": ["#8FA351", "#7C9044", "#9FB265"],
  "almond-sliver": ["#DFCCA6", "#D0BA8E", "#EADCBC"],
  macaron: ["#E0A2B0", "#EBCF9A", "#B9CFA6", "#C8A9CE", "#E8B79A"],
  "edible-flower": ["#D18AA4", "#E4C069", "#C4A2CE", "#EDE0D0"],
  "meringue-kiss": ["#F4E6D8", "#EDD3D8", "#E8DCC4"],
};

/**
 * At #D8D3CA the board was an off-white disc under an off-white cake on an
 * off-white page: three values within a few percent of each other, so the cake
 * had no base and appeared to float. A real board is foil-laminated card, which
 * is both darker than the cake and slightly specular — the specular is what
 * separates it, because it catches the key light where the matte frosting does
 * not.
 *
 * That reasoning holds; the value chosen to express it did not. `metalness: 0.22`
 * is a fifth of a conductor, and metalness has no middle: it fades out the
 * diffuse colour and tints the reflection with it, so the board came out as a
 * desaturated grey-gold with a sheet-metal highlight — a cake stand, not a card
 * round. The separation the comment is after is *specular*, and a dielectric can
 * have as much of that as it likes. So: near-zero metal, a low ior-driven
 * highlight, and the grain doing the rest.
 *
 * The colour is lifted to suit `boardGrain`, which can only darken.
 */
export const BOARD_MATERIAL = {
  color: "#B4A995",
  roughness: 0.52,
  metalness: 0.04,
  ior: 1.44,
  specularIntensity: 0.6,
} as const;
