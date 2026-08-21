import type { CakeConfig } from "./schema";

/**
 * The cake on the landing page, and only there.
 *
 * Deliberately not a `PRESETS` entry. A preset is a thing a customer can order
 * off the gallery, and adding one to sell the hero would put a card on
 * /presets that nobody asked for. This is art direction, so it lives on its
 * own — the page reads its name and price for the spec block exactly the way
 * it read a preset's.
 *
 * WHY THESE CHOICES
 *
 * Dark ganache carries the whole look. It is the one frosting in the catalogue
 * with `fixedColor` and a real clearcoat (see materials.FROSTING_MATERIALS), so
 * it renders as set chocolate — wet, not merely brown — and its warm-tinted
 * specular is what keeps a dark dielectric from reading as painted metal.
 *
 * `combed` is the horizontal texture. A serrated comb is the only finish here
 * that displaces along Y rather than around the cake (geometry.shellGeometry
 * adds `sin(y · 88)`), which is what puts level bands round the tier instead of
 * vertical streaks or palette-knife swirls.
 *
 * The garnish is four kinds and no more, and none of it is `crown`.
 *
 * That second part is not taste, it is arithmetic. A message plaque reserves a
 * keep-off box 1.55 × the usable top radius wide, inflated a further 22% (see
 * MessagePlaque.plaqueFootprint), and `crown` only ever places inside 0.42 of
 * that radius — so on any cake carrying a message, every crown piece is
 * rejected and the cake renders bare. The old landing preset asked for a
 * macaron crown *and* "Happy Birthday", and got no macarons at all. Berries go
 * on `top-scatter` instead, which darts around the plaque and fills the clear
 * ground in front of and behind it; the strawberries take the ring, which puts
 * the biggest fruit at the shoulder where a decorator would set it.
 */
export const HERO_CAKE: CakeConfig = {
  version: 1,

  shape: "round",
  size: "2kg",
  tiers: 2,
  layers: 3,

  sponge: "belgian-chocolate",
  filling: "chocolate-mousse",

  frosting: "dark-ganache",
  coverage: "full",
  finish: "combed",
  // Ganache ignores this — it is fixedColor — but the schema wants a valid hex
  // and a lie here would mislead the next person to read it.
  frostingColor: "#3B2318",

  hasDrip: true,
  /*
   * A shade lighter than the coat, not darker.
   *
   * The instinct on a dark cake is to pour something darker still, and the
   * result is invisible: a #2A1712 drip on a #3B2318 tier is one flat silhouette
   * with a gloss seam. Real drip cakes pour a looser, warmer chocolate over a
   * set one, and that half-stop of separation is the entire reason the drip
   * reads as a drip.
   */
  dripColor: "#54341F",

  toppings: [
    { kind: "mixed-berry", placement: "top-scatter", density: 3 },
    { kind: "strawberry", placement: "top-ring", density: 2 },
    { kind: "chocolate-shard", placement: "top-scatter", density: 1 },
    // One flick of gold. At density 2 it stops being an accent and starts
    // looking like glitter.
    { kind: "gold-leaf", placement: "top-scatter", density: 1 },
  ],

  message: "Happy Birthday",
  // Piped chocolate on the white-chocolate plaque. MessagePlaque pulls whatever
  // it is given down to l ≤ 0.26 for legibility, so this is already where it
  // wants to be.
  messageColor: "#4A2C1A",

  eggless: false,
  sugarFree: false,
  delivery: "standard",
};

/** Shown in the hero's spec block, where a preset's name used to be. */
export const HERO_CAKE_NAME = "Dark Chocolate & Berries";
