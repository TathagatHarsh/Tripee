import * as THREE from "three";

/**
 * A perfectly uniform surface reads as plastic. Everything gets 2–3% of
 * micro-variation, driven from here. No texture files, no network fetch — the
 * maps are generated once on the client and cached.
 */

function hash3(x: number, y: number, z: number): number {
  let h = 374761393 + Math.imul(x | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= Math.imul(y | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  h ^= Math.imul(z | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 16), 668265263);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const c00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf);
  const c10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf);
  const c01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf);
  const c11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf);

  return lerp(lerp(c00, c10, yf), lerp(c01, c11, yf), zf);
}

export function fbm3(x: number, y: number, z: number, octaves = 4, gain = 0.5, lacunarity = 2): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3(x * f, y * f, z * f) * amp;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** 2D slice of the same field, for texture generation. */
function fbm2(x: number, y: number, octaves: number, gain = 0.5): number {
  return fbm3(x, y, 0.5, octaves, gain);
}

type FieldSpec = {
  size: number;
  frequency: number;
  octaves: number;
  /** Stretches the field so ridges run one way (combed frosting, sponge crumb). */
  anisotropy?: number;
};

type NormalMapSpec = FieldSpec & { strength: number };

const cache = new Map<string, THREE.Texture>();

/**
 * The height field both map types are built from. Shared so a luminance map and
 * a normal map asked for at the same frequency describe the *same* surface —
 * which is the whole point of correlating them: the place a bump catches the
 * light should also be the place the surface reads smoother.
 */
function heightField({ size, frequency, octaves, anisotropy = 1 }: FieldSpec): Float32Array {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] = fbm2(
        (x / size) * frequency * anisotropy,
        (y / size) * frequency,
        octaves,
      );
    }
  }
  return height;
}

/** Shared texture setup: everything generated here tiles and is mipmapped. */
function dataTexture(data: Uint8Array, size: number): THREE.Texture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Height field → tangent-space normal map, as a DataTexture. Kept small
 * (256–512) to stay well inside the 30MB texture budget.
 */
export function normalMap(key: string, spec: NormalMapSpec): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;

  const { size, strength } = spec;
  const height = heightField(spec);

  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normalise (-dx, -dy, 1)
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }

  const tex = dataTexture(data, size);
  cache.set(key, tex);
  return tex;
}

/**
 * Height field → greyscale, as a DataTexture centred on 1.0.
 *
 * A normal map only changes where the light *comes from*; it cannot stop a
 * surface being one flat value. That is why the sponge read as a coloured
 * cylinder and the board as a beige disc: both had shading variation and no
 * *tonal* variation. Multiplied into `map` this breaks up the colour, and
 * multiplied into `roughnessMap` it breaks up the specular — which is what stops
 * a whole tier of frosting sharing one unbroken highlight.
 *
 * An 8-bit texture cannot express a multiplier above 1, so this is a *darkening*
 * field: it runs from `1 - depth` up to 1. Whatever it multiplies therefore has
 * to be specified at the value its lightest patches should be, not at its
 * average — see the sponge and board colours, both lifted to suit.
 */
export function luminanceMap(
  key: string,
  spec: FieldSpec & { depth: number },
): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;

  const { size, depth } = spec;
  const height = heightField(spec);

  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = 1 - depth * (1 - THREE.MathUtils.clamp(height[i], 0, 1));
    const b = Math.round(v * 255);
    const j = i * 4;
    data[j] = data[j + 1] = data[j + 2] = b;
    data[j + 3] = 255;
  }

  const tex = dataTexture(data, size);
  cache.set(key, tex);
  return tex;
}

/**
 * Satin — scraped buttercream, meringue, ganache.
 *
 * This map is tiled several times around the cake (see materials.tileRepeat), so
 * its frequency is multiplied by the repeat count before it reaches the eye. At
 * 26 the product was a bump every 3mm of real cake, which is not frosting — it
 * is stucco. Frosting off a bench scraper is broad and slow: one soft
 * undulation every inch or two, and nothing finer.
 */
export const frostingNormal = () =>
  normalMap("frosting", { size: 512, frequency: 6, octaves: 3, strength: 5 });

/**
 * All but flat. Smooth, ombré and combed finishes are *defined* by the absence
 * of surface texture — the whole point of a bench scraper is that it takes the
 * texture off. Any visible grain here is a lie about the finish the customer
 * paid for.
 */
export const satinNormal = () =>
  normalMap("satin", { size: 256, frequency: 3.2, octaves: 2, strength: 2.2 });

/** Coarser, softer — whipped cream and rustic palette-knife work. */
export const creamNormal = () =>
  normalMap("cream", { size: 512, frequency: 5, octaves: 3, strength: 11 });

/** Crumb. This is what makes a cut sponge read as cake and not a coloured cylinder. */
export const spongeNormal = () =>
  normalMap("sponge", { size: 512, frequency: 38, octaves: 4, strength: 22 });

/** Almost flat — fondant and mirror glaze only need a whisper. */
export const sheetNormal = () =>
  normalMap("sheet", { size: 256, frequency: 8, octaves: 3, strength: 6 });

/**
 * The cake board — pressed card.
 *
 * Was strength 14 at 6× repeat, which is a bump every half-millimetre of real
 * board: sandpaper, and the single most artificial surface in the frame. Card is
 * smooth to the eye; what it has is a *grain*, so the strength comes right down
 * and the anisotropy carries the look instead.
 */
export const boardNormal = () =>
  normalMap("board", { size: 256, frequency: 34, octaves: 3, strength: 4, anisotropy: 0.34 });

/**
 * Crumb tone, for the sponge colour to be multiplied by. Same frequency as
 * `spongeNormal`, so the tonal variation sits on the same crumb the normal map
 * is shading rather than fighting it.
 */
export const spongeCrumb = () =>
  luminanceMap("sponge-crumb", { size: 512, frequency: 38, octaves: 4, depth: 0.26 });

/** Card grain, matching `boardNormal`'s field so the two agree. */
export const boardGrain = () =>
  luminanceMap("board-grain", { size: 256, frequency: 34, octaves: 3, depth: 0.14, anisotropy: 0.34 });

/**
 * Roughness break-up for frosting. Buttercream is not uniformly matte — it is
 * duller where it is thick and slightly wetter where the scraper burnished it,
 * and without that the whole tier shares one unbroken specular lobe, which is
 * the plastic tell. Broad and shallow on purpose: this must be felt, not seen.
 */
export const frostingRoughness = () =>
  luminanceMap("frosting-rough", { size: 256, frequency: 4.5, octaves: 3, depth: 0.3 });

/**
 * Speculoos crumb — the fine, shallow pitting all over a moulded biscuit.
 *
 * The one topping with a normal map, because it is the one topping with a face
 * broad and flat enough to have nothing on it. Everything else in the catalogue
 * is a small curved solid whose silhouette is doing the work; a biscuit is a
 * 60mm plane held up to the key light, and a plane with a constant normal is
 * plastic no matter what colour it is.
 *
 * Frequency is read against the biscuit's own UVs, which ExtrudeGeometry writes
 * in shape units — and those are square, u running 1.0 over the biscuit's 60mm
 * length and v running 0.4 over its 25mm width, so one tile covers it without any
 * repeat and without stretching. 30 is a pit every 2mm.
 *
 * 512, not the 256 the other fine fields use. A value-noise lattice at 256 and
 * this frequency is six pixels to a cell, and six-pixel cells read as a woven
 * grid rather than as crumb — the one texture here whose frequency is high enough
 * for its own lattice to show. The side walls get the same UVs squashed into a
 * 6mm thickness and so wear a stretched version of the field, which is wrong and
 * is also two pixels of a piece lying face up.
 */
export const biscuitCrumb = () =>
  normalMap("biscuit-crumb", { size: 512, frequency: 30, octaves: 3, strength: 6 });
