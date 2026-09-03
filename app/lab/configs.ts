import { DEFAULT_CAKE, type CakeConfig } from "@/lib/schema";

const c = (patch: Partial<CakeConfig>): CakeConfig => ({ ...DEFAULT_CAKE, ...patch });

/** The extremes, deliberately. If all of them look edible, the look is found. */
export const LAB_CONFIGS: { label: string; note: string; config: CakeConfig }[] = [
  {
    label: "Darkest ganache",
    note: "Low roughness, clearcoat. The gloss test.",
    config: c({
      sponge: "belgian-chocolate", frosting: "dark-ganache", finish: "smooth",
      frostingColor: "#3B2318", hasDrip: true, dripColor: "#3B2318",
      toppings: [{ kind: "chocolate-curl", placement: "top-ring", density: 3 }],
    }),
  },
  {
    label: "Palest whipped cream",
    note: "Nothing to hide behind. If this blows out, exposure is wrong.",
    config: c({
      frosting: "whipped-cream", finish: "rustic", frostingColor: "#F7F1E6",
      delivery: "pickup",
      toppings: [{ kind: "strawberry", placement: "top-ring", density: 3 }],
    }),
  },
  {
    label: "Three-tier, tallest",
    note: "Framing and shadow spread at maximum height.",
    config: c({
      size: "5kg", tiers: 3, frosting: "swiss-meringue", finish: "smooth",
      frostingColor: "#EAC7C0", sponge: "red-velvet", filling: "raspberry-compote",
      toppings: [{ kind: "edible-flower", placement: "cascade", density: 3 }],
      message: "Congratulations",
    }),
  },
  {
    label: "Smallest, 0.5kg",
    note: "Garnish scale check — a strawberry is still a strawberry.",
    config: c({
      size: "0.5kg", frosting: "cream-cheese", finish: "combed",
      frostingColor: "#F8F0E2", sponge: "carrot",
      toppings: [{ kind: "pistachio-crumb", placement: "base-border", density: 3 }],
    }),
  },
  {
    label: "Most cluttered",
    note: "Four toppings at high density. Draw-call and read test.",
    config: c({
      size: "2kg", sponge: "funfetti", frosting: "american-buttercream",
      finish: "rustic", frostingColor: "#A8BDD1", hasDrip: true, dripColor: "#E8D9BE",
      toppings: [
        { kind: "sprinkles", placement: "top-scatter", density: 5 },
        { kind: "macaron", placement: "crown", density: 4 },
        { kind: "oreo", placement: "base-border", density: 4 },
        { kind: "meringue-kiss", placement: "top-ring", density: 3 },
      ],
      message: "Happy Birthday",
    }),
  },
  {
    label: "Naked",
    note: "Sponge crumb is doing all the work here.",
    config: c({
      size: "1.5kg", sponge: "vanilla", filling: "strawberry-jam", layers: 4,
      coverage: "naked", frosting: "cream-cheese", finish: "rustic",
      toppings: [{ kind: "mixed-berry", placement: "top-scatter", density: 3 }],
    }),
  },
  {
    label: "Fondant",
    note: "Flattest surface in the catalogue. Micro-variation test.",
    config: c({
      size: "2kg", frosting: "fondant", finish: "smooth", frostingColor: "#B7A6C4",
      sponge: "lemon", filling: "lemon-curd",
      toppings: [{ kind: "gold-leaf", placement: "top-scatter", density: 2 }],
      message: "Many Happy Returns",
    }),
  },
  {
    label: "Mirror glaze",
    note: "Roughness 0.06. Everything reflected comes from the lightformers.",
    config: c({
      frosting: "mirror-glaze", finish: "smooth", frostingColor: "#C4342A",
      sponge: "belgian-chocolate", filling: "hazelnut-praline",
      toppings: [{ kind: "gold-leaf", placement: "top-ring", density: 1 }],
      delivery: "pickup",
    }),
  },
  {
    label: "Ruffle, two tier",
    note: "Instanced frills. The heaviest geometry in the set.",
    config: c({
      size: "2kg", tiers: 2, frosting: "swiss-meringue", finish: "ruffle",
      frostingColor: "#EAC7C0", sponge: "vanilla", filling: "salted-caramel",
    }),
  },
  {
    label: "Rosette, square",
    note: "Piped spirals on a shape with corners.",
    config: c({
      shape: "square", size: "1.5kg", frosting: "american-buttercream",
      finish: "rosette", frostingColor: "#A9B99A", sponge: "pistachio",
    }),
  },
  {
    label: "Heart, ombré",
    note: "Bézier silhouette plus a vertex-colour gradient.",
    config: c({
      shape: "heart", size: "1kg", frosting: "white-ganache", finish: "ombre",
      frostingColor: "#D9A0A0", sponge: "red-velvet", filling: "raspberry-compote",
      message: "I love you",
    }),
  },
];
