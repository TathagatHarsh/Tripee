import { z } from "zod";

export const Shape = z.enum([
  "round", "square", "rectangle", "heart", "hexagon",
]);

export const SizeBand = z.enum([
  "0.5kg", "1kg", "1.5kg", "2kg", "3kg", "5kg",
]);

export const Sponge = z.enum([
  "vanilla", "belgian-chocolate", "red-velvet", "butterscotch",
  "coffee", "lemon", "pineapple", "mango", "saffron", "carrot",
  "pistachio", "coconut", "marble", "funfetti",
]);

export const Filling = z.enum([
  "none", "strawberry-jam", "raspberry-compote", "cherry-compote",
  "blueberry-compote", "pineapple-crush", "lemon-curd",
  "vanilla-custard", "rabri", "chocolate-mousse", "salted-caramel",
  "biscoff-spread", "nutella", "hazelnut-praline", "pistachio-cream",
  "cookie-crumb", "fresh-fruit",
]);

export const Frosting = z.enum([
  "whipped-cream", "american-buttercream", "swiss-meringue",
  "cream-cheese", "dark-ganache", "milk-ganache", "white-ganache",
  "fondant", "mirror-glaze",
]);

export const Coverage = z.enum(["full", "semi-naked", "naked", "top-only"]);

export const Finish = z.enum([
  "smooth", "rustic", "ruffle", "rosette", "combed", "ombre",
]);

export const Topping = z.enum([
  "strawberry", "mixed-berry", "blueberry", "cherry", "pineapple-chunk",
  "chocolate-shard", "chocolate-curl", "white-chocolate-curl", "truffle",
  "caramel-shard", "butterscotch-crunch", "biscoff-biscuit", "biscoff-crumb",
  "macaron", "meringue-kiss", "rasmalai-disc", "gold-leaf", "sprinkles",
  "pistachio-crumb", "pistachio-nut", "almond-sliver", "edible-flower",
  "oreo", "ferrero",
]);

export const ToppingPlacement = z.enum([
  "top-scatter", "top-ring", "base-border", "cascade", "crown",
]);

export const ToppingSpec = z.object({
  kind: Topping,
  placement: ToppingPlacement,
  density: z.number().int().min(1).max(5),
});

export const DeliverySlot = z.enum([
  "standard", "same-day", "express-4hr", "midnight", "pickup",
]);

/** THE object. Everything reads from this. */
export const CakeConfig = z.object({
  version: z.literal(1),

  shape: Shape,
  size: SizeBand,
  tiers: z.number().int().min(1).max(3),
  layers: z.number().int().min(2).max(4),

  sponge: Sponge,
  filling: Filling,

  frosting: Frosting,
  coverage: Coverage,
  finish: Finish,
  frostingColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  hasDrip: z.boolean(),
  dripColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),

  toppings: z.array(ToppingSpec).max(4),

  message: z.string().max(60).optional(),
  messageColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),

  eggless: z.boolean(),
  sugarFree: z.boolean(),

  delivery: DeliverySlot,
  pincode: z.string().regex(/^\d{6}$/).optional(),
});

export type CakeConfig = z.infer<typeof CakeConfig>;

export type Shape = z.infer<typeof Shape>;
export type SizeBand = z.infer<typeof SizeBand>;
export type Sponge = z.infer<typeof Sponge>;
export type Filling = z.infer<typeof Filling>;
export type Frosting = z.infer<typeof Frosting>;
export type Coverage = z.infer<typeof Coverage>;
export type Finish = z.infer<typeof Finish>;
export type Topping = z.infer<typeof Topping>;
export type ToppingPlacement = z.infer<typeof ToppingPlacement>;
export type ToppingSpec = z.infer<typeof ToppingSpec>;
export type DeliverySlot = z.infer<typeof DeliverySlot>;

export const DEFAULT_CAKE: CakeConfig = {
  version: 1,
  shape: "round",
  size: "1kg",
  tiers: 1,
  layers: 3,
  sponge: "vanilla",
  filling: "none",
  frosting: "american-buttercream",
  coverage: "full",
  finish: "smooth",
  frostingColor: "#F3E7D3",
  hasDrip: false,
  toppings: [],
  eggless: true,
  sugarFree: false,
  delivery: "standard",
};

/**
 * Saved designs live in a database and get shared by URL. When a field is added
 * in v2, old saved configs must still load. Migrate here rather than shrugging
 * at broken links.
 */
export function migrateConfig(raw: unknown): CakeConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = coerceLegacy(raw) as Record<string, unknown>;

  // v1 is current. Future versions add their upgrade step above this line.
  const parsed = CakeConfig.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

/**
 * Withdrawn option values, translated rather than rejected.
 *
 * Bundt is no longer a shape we bake. A saved design that names it is not
 * corrupt, though — it is a cake somebody actually configured and may have sent
 * to somebody else — so it loads as the round it was always closest to. The ring
 * mould is the only thing that has gone; the size, sponge, filling, toppings and
 * message on that ticket are all still real, and dropping the whole design over
 * one withdrawn value would break every link that carries it.
 *
 * This is deliberately *not* a version bump. A version bump would mean writing
 * v2 to the database on next save and needing a v1 reader forever; a shape that
 * no longer exists just resolves to one that does, on read, every time.
 *
 * Every deserialisation path routes through here — lib/share (URLs), app/d/[slug]
 * (saved designs), app/kitchen (live orders), scripts/docket, and lib/store's
 * own sessionStorage merge, which parses directly and so calls this itself.
 */
export function coerceLegacy(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.shape === "bundt") return { ...obj, shape: "round" };
  return obj;
}
