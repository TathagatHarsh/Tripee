import type {
  Coverage, DeliverySlot, Filling, Finish, Frosting, Shape, SizeBand, Sponge,
  Topping, ToppingPlacement,
} from "./schema";

export interface Option<T extends string> {
  value: T;
  name: string;
  /** One line, in the bakery's voice. Never marketing copy. */
  blurb: string;
  /** Hex used for the swatch chip — matches what the renderer will produce. */
  swatch?: string;
  /**
   * An SVG path in a 24×24 box, drawn as the option's outline.
   *
   * The shape step is the first screen of the product and it showed six
   * rectangles of text with the words "Round", "Square", "Heart" on them. A
   * picker whose entire subject is a silhouette has to show the silhouette;
   * making someone read the word "hexagon" and picture it is asking them to do
   * the one job the screen exists to do.
   */
  glyph?: string;
}

export const SHAPES: Option<Shape>[] = [
  {
    value: "round", name: "Round",
    blurb: "The default for a reason. Cuts evenly, frosts cleanly.",
    glyph: "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Z",
  },
  {
    value: "square", name: "Square",
    blurb: "More servings per kilo. Corners take a sharp edge.",
    glyph: "M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z",
  },
  {
    value: "rectangle", name: "Rectangle",
    blurb: "Sheet cake. Best when you're feeding a room.",
    glyph: "M2.5 6.5h19a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-19a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z",
  },
  {
    value: "heart", name: "Heart",
    blurb: "Hand-cut from a round. Slightly fewer clean slices.",
    glyph: "M12 21S3 14.6 3 9.2A5.2 5.2 0 0 1 12 5.8a5.2 5.2 0 0 1 9 3.4C21 14.6 12 21 12 21Z",
  },
  {
    value: "hexagon", name: "Hexagon",
    blurb: "Six flat faces to decorate. Reads modern.",
    glyph: "M12 2.6 20.1 7.3v9.4L12 21.4 3.9 16.7V7.3Z",
  },
  {
    value: "bundt", name: "Bundt",
    blurb: "Ring mould, fluted sides. Glaze rather than frost.",
    glyph: "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm0 6a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z",
  },
];

export const SIZES: Option<SizeBand>[] = [
  { value: "0.5kg", name: "0.5 kg", blurb: "6in · serves 4–5" },
  { value: "1kg", name: "1 kg", blurb: "7in · serves 8–10" },
  { value: "1.5kg", name: "1.5 kg", blurb: "8in · serves 12–15" },
  { value: "2kg", name: "2 kg", blurb: "9in · serves 16–20" },
  { value: "3kg", name: "3 kg", blurb: "10in · serves 24–30" },
  { value: "5kg", name: "5 kg", blurb: "12in · serves 40–50" },
];

export const SPONGES: Option<Sponge>[] = [
  { value: "vanilla", name: "Vanilla", blurb: "Madagascar bean, not essence.", swatch: "#E8D4A8" },
  { value: "belgian-chocolate", name: "Belgian Chocolate", blurb: "54% couverture in the batter.", swatch: "#4A3226" },
  { value: "red-velvet", name: "Red Velvet", blurb: "Cocoa and buttermilk. Pairs with cream cheese.", swatch: "#8B2E20" },
  { value: "butterscotch", name: "Butterscotch", blurb: "Browned butter and dark sugar.", swatch: "#D9A860" },
  { value: "coffee", name: "Coffee", blurb: "Single-origin espresso, brewed for the batter.", swatch: "#6B4E3A" },
  { value: "lemon", name: "Lemon", blurb: "Zest in the crumb, juice in the syrup.", swatch: "#EDDC9A" },
  { value: "pineapple", name: "Pineapple", blurb: "Crushed fruit folded through.", swatch: "#E8DCA0" },
  { value: "mango", name: "Mango", blurb: "Alphonso pulp. Seasonal — Apr to Jun.", swatch: "#E5C36A" },
  { value: "saffron", name: "Saffron", blurb: "Kashmiri strands steeped in warm milk.", swatch: "#E9CE78" },
  { value: "carrot", name: "Carrot", blurb: "Walnut and cinnamon. Contains tree nuts.", swatch: "#C08A4E" },
  { value: "pistachio", name: "Pistachio", blurb: "Iranian pistachio paste, no colouring.", swatch: "#B8C48A" },
  { value: "coconut", name: "Coconut", blurb: "Desiccated coconut and coconut milk.", swatch: "#EFE6D2" },
  { value: "marble", name: "Marble", blurb: "Vanilla and chocolate swirled, not layered.", swatch: "#D6C09A" },
  { value: "funfetti", name: "Funfetti", blurb: "Vanilla with sprinkles through the crumb.", swatch: "#EDDFC4" },
];

export const FILLINGS: Option<Filling>[] = [
  { value: "none", name: "None", blurb: "Frosting between the layers. Plenty of cakes stop here." },
  { value: "strawberry-jam", name: "Strawberry Jam", blurb: "Cooked down in-house, not from a tin." },
  { value: "raspberry-compote", name: "Raspberry Compote", blurb: "Sharp. Cuts through rich frostings." },
  { value: "cherry-compote", name: "Cherry Compote", blurb: "Morello cherries in their own syrup, thickened." },
  { value: "blueberry-compote", name: "Blueberry Compote", blurb: "Cooked only until they burst. Stains the sponge." },
  { value: "pineapple-crush", name: "Pineapple Crush", blurb: "Crushed and drained, or it soaks the layers." },
  { value: "lemon-curd", name: "Lemon Curd", blurb: "Set with butter and yolk. Keep it cold." },
  { value: "vanilla-custard", name: "Vanilla Custard", blurb: "Crème pâtissière. Shortens shelf life to 24h." },
  { value: "rabri", name: "Rabri", blurb: "Milk reduced for two hours with saffron and cardamom." },
  { value: "chocolate-mousse", name: "Chocolate Mousse", blurb: "Aerated ganache. Soft at room temperature." },
  { value: "salted-caramel", name: "Salted Caramel", blurb: "Dark caramel, flaked sea salt." },
  { value: "biscoff-spread", name: "Biscoff Spread", blurb: "Lotus spread, warmed until it pours." },
  { value: "nutella", name: "Nutella", blurb: "Straight from the jar, thinned with cream." },
  { value: "hazelnut-praline", name: "Hazelnut Praline", blurb: "Caramelised hazelnuts, ground to a paste." },
  { value: "pistachio-cream", name: "Pistachio Cream", blurb: "Pistachio paste folded through crème pâtissière." },
  { value: "cookie-crumb", name: "Cookie Crumb", blurb: "Crushed cocoa biscuit for texture." },
  { value: "fresh-fruit", name: "Fresh Fruit", blurb: "Whatever's good that week. Shortens shelf life." },
];

export const FROSTINGS: Option<Frosting>[] = [
  { value: "whipped-cream", name: "Whipped Cream", blurb: "Light, barely sweet. Single tier only.", swatch: "#F7F1E6" },
  { value: "american-buttercream", name: "American Buttercream", blurb: "Sturdy and sweet. Holds piping.", swatch: "#F3E7D3" },
  { value: "swiss-meringue", name: "Swiss Meringue", blurb: "Silky, less sweet. The one bakers prefer.", swatch: "#F5EADA" },
  { value: "cream-cheese", name: "Cream Cheese", blurb: "Tangy. The right answer for red velvet and carrot.", swatch: "#F8F0E2" },
  { value: "dark-ganache", name: "Dark Ganache", blurb: "54% chocolate and cream. Sets firm.", swatch: "#3B2318" },
  { value: "milk-ganache", name: "Milk Ganache", blurb: "Sweeter, softer set than dark.", swatch: "#6B4A32" },
  { value: "white-ganache", name: "White Ganache", blurb: "Takes colour better than any other frosting.", swatch: "#EFE3CE" },
  { value: "fondant", name: "Fondant", blurb: "Rolled sheet, perfectly smooth. Peel it off to eat.", swatch: "#F2EADC" },
  { value: "mirror-glaze", name: "Mirror Glaze", blurb: "Poured at 32°C. Reflects the room.", swatch: "#C4342A" },
];

export const COVERAGES: Option<Coverage>[] = [
  { value: "full", name: "Full", blurb: "Sides and top completely covered." },
  { value: "semi-naked", name: "Semi-naked", blurb: "Thin scrape — the sponge shows through." },
  { value: "naked", name: "Naked", blurb: "Frosting between layers only. Sides bare." },
  { value: "top-only", name: "Top only", blurb: "Sides bare, top loaded. Good for bundt." },
];

export const FINISHES: Option<Finish>[] = [
  { value: "smooth", name: "Smooth", blurb: "Scraped flat with a bench scraper." },
  { value: "rustic", name: "Rustic", blurb: "Swirled with a palette knife. Forgiving." },
  { value: "ruffle", name: "Ruffle", blurb: "Overlapping frills, piped by hand. Slow work." },
  { value: "rosette", name: "Rosette", blurb: "Piped spirals covering the whole surface." },
  { value: "combed", name: "Combed", blurb: "Horizontal ridges from a serrated scraper." },
  { value: "ombre", name: "Ombré", blurb: "Colour graded from base to top." },
];

export const TOPPINGS: Option<Topping>[] = [
  { value: "strawberry", name: "Strawberry", blurb: "Halved and glazed. Seasonal quality varies.", swatch: "#C42B36" },
  { value: "mixed-berry", name: "Mixed Berry", blurb: "Blueberry, raspberry, blackberry. Imported.", swatch: "#5B2A54" },
  { value: "blueberry", name: "Blueberry", blurb: "Whole, with the bloom left on them.", swatch: "#46538A" },
  { value: "cherry", name: "Cherry", blurb: "Stems on, stones out. Two weeks of the year are good.", swatch: "#AE3A42" },
  { value: "pineapple-chunk", name: "Pineapple", blurb: "Cut off the ring and drained overnight.", swatch: "#E0AF48" },
  { value: "chocolate-shard", name: "Chocolate Shard", blurb: "Tempered sheets, snapped by hand.", swatch: "#3B2318" },
  { value: "chocolate-curl", name: "Chocolate Curl", blurb: "Scraped from a warmed block.", swatch: "#4A3226" },
  { value: "white-chocolate-curl", name: "White Chocolate Curl", blurb: "28% block. Warmer to work than dark.", swatch: "#E5D5B4" },
  { value: "truffle", name: "Truffle", blurb: "Rolled by hand, dusted in cocoa.", swatch: "#3B2419" },
  { value: "caramel-shard", name: "Caramel Shard", blurb: "Poured at 155°C and cracked cold.", swatch: "#C58A34" },
  { value: "butterscotch-crunch", name: "Butterscotch Crunch", blurb: "Cracked coarse. Goes soft after a day.", swatch: "#C1863C" },
  { value: "biscoff-biscuit", name: "Biscoff Biscuit", blurb: "Lotus, whole. Laid on at the last moment.", swatch: "#BE8146" },
  { value: "biscoff-crumb", name: "Biscoff Crumb", blurb: "The same biscuit under a rolling pin.", swatch: "#C0905F" },
  { value: "macaron", name: "Macaron", blurb: "Almond shells, made in-house. Contains egg.", swatch: "#E8A9B8" },
  { value: "meringue-kiss", name: "Meringue Kiss", blurb: "Piped and dried overnight. Contains egg.", swatch: "#F7ECE0" },
  { value: "rasmalai-disc", name: "Rasmalai", blurb: "Chenna patties, pressed and soaked. Keep cold.", swatch: "#F3E9D2" },
  { value: "gold-leaf", name: "Gold Leaf", blurb: "23-carat edible. Applied with a brush.", swatch: "#C9A227" },
  { value: "sprinkles", name: "Sprinkles", blurb: "Cheerful and cheap. No shame in it.", swatch: "#E2758F" },
  { value: "pistachio-crumb", name: "Pistachio Crumb", blurb: "Coarse-chopped, unsalted.", swatch: "#8FA35C" },
  { value: "pistachio-nut", name: "Whole Pistachio", blurb: "Kernels with the skins still on.", swatch: "#A6BC70" },
  { value: "almond-sliver", name: "Almond Sliver", blurb: "Blanched and shaved thin.", swatch: "#E4D3B0" },
  { value: "edible-flower", name: "Edible Flower", blurb: "Pesticide-free, placed on the day.", swatch: "#D98CA8" },
  { value: "oreo", name: "Oreo", blurb: "Whole and halved. Reliably popular.", swatch: "#2A2320" },
  { value: "ferrero", name: "Ferrero", blurb: "Whole, in gold foil or unwrapped.", swatch: "#8A6A3C" },
];

/**
 * `short` is the same choice named for a 36px pill in a strip that has to fit on
 * top of the render — see builder/ToppingBar.
 *
 * Two names for one thing is a cost worth being honest about. It is smaller than
 * the alternative, which is a strip the customer has to scroll sideways past the
 * option they are looking for; and `name` remains the only one that is ever read
 * aloud, so nothing is hidden from anyone who cannot see the pill.
 */
export const PLACEMENTS: (Option<ToppingPlacement> & { short: string })[] = [
  { value: "top-scatter", name: "Scattered on top", short: "Scatter", blurb: "Loose, uneven. Reads relaxed." },
  { value: "top-ring", name: "Ring on top", short: "Ring", blurb: "Even circle inset from the edge." },
  { value: "base-border", name: "Base border", short: "Border", blurb: "Around the bottom where the cake meets the board." },
  { value: "cascade", name: "Cascade", short: "Cascade", blurb: "Falling from one shoulder down the side." },
  { value: "crown", name: "Crown", short: "Crown", blurb: "Piled high in the centre. Uses the most." },
];

export const DELIVERY_OPTIONS: Option<DeliverySlot>[] = [
  { value: "standard", name: "Standard", blurb: "48 hours · 10:00–20:00" },
  { value: "same-day", name: "Same day", blurb: "12 hours · order before 11:00" },
  { value: "express-4hr", name: "Express 4-hour", blurb: "4 hours · core Hyderabad only" },
  { value: "midnight", name: "Midnight", blurb: "23:30–00:30 · order by 18:00" },
  { value: "pickup", name: "Store pickup", blurb: "Jubilee Hills · 10:00–21:00" },
];

/** Frosting colours a kitchen can actually hit with natural colouring. */
export const FROSTING_PALETTE: { name: string; hex: string }[] = [
  { name: "Ivory", hex: "#F3E7D3" },
  { name: "Blush", hex: "#EAC7C0" },
  { name: "Dusty rose", hex: "#D9A0A0" },
  { name: "Terracotta", hex: "#C87F5C" },
  { name: "Butter", hex: "#EFD9A0" },
  { name: "Sage", hex: "#A9B99A" },
  { name: "Eucalyptus", hex: "#8FA79B" },
  { name: "Sky", hex: "#A8BDD1" },
  { name: "Cornflower", hex: "#8093B8" },
  { name: "Lilac", hex: "#B7A6C4" },
  { name: "Chocolate", hex: "#5A3E2E" },
  { name: "Charcoal", hex: "#4A4642" },
];

export const DRIP_PALETTE: { name: string; hex: string }[] = [
  { name: "Dark chocolate", hex: "#3B2318" },
  { name: "Milk chocolate", hex: "#6B4A32" },
  { name: "White chocolate", hex: "#E8D9BE" },
  { name: "Caramel", hex: "#B07A38" },
  { name: "Ruby", hex: "#A83C50" },
];

export const STEPS = [
  { slug: "shape", title: "Shape", hint: "Start with the outline." },
  { slug: "size", title: "Size & tiers", hint: "How many people are eating?" },
  { slug: "sponge", title: "Sponge layers", hint: "Every layer is this sponge." },
  { slug: "filling", title: "Between layers", hint: "What goes in the gaps." },
  { slug: "frosting", title: "Frosting", hint: "What covers it." },
  { slug: "finish", title: "Colour & finish", hint: "Surface and hue." },
  { slug: "toppings", title: "Toppings", hint: "What lands on it." },
  { slug: "message", title: "Message", hint: "What it says." },
  { slug: "review", title: "Review", hint: "Check the docket." },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"];
