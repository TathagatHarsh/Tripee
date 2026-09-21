import type { CatalogCategory } from "@prisma/client";

/**
 * The portal's own map of itself.
 *
 * Here rather than inside the sidebar component for two reasons. The sidebar is
 * a client component (it needs `usePathname` to mark the current item) and the
 * breadcrumb, the page titles and the catalogue overview are all server-rendered
 * — a list that lived in the client component would have to be duplicated for
 * them, and the copy that goes stale is always the one nobody is looking at. And
 * this file has no imports beyond a type, so it costs the client bundle nothing.
 *
 * ## Sections, and why these four
 *
 * §5 of the brief asks for OVERVIEW / OPERATIONS / CATALOGUE / BUSINESS, and the
 * grouping earns itself: they are four different jobs done at four different
 * times of day. Operations is the morning — what came in, what is late, what
 * goes out. Catalogue is a Tuesday afternoon decision about what the shop sells.
 * Business is the thing you touch twice a year.
 *
 * ## Routes are reused, never restructured
 *
 * Every href below already existed (/admin, /admin/orders, /admin/orders/today,
 * /admin/vendors, /admin/delivery, /admin/cakes, /admin/settings, /admin/staff).
 * Nothing was moved, so no bookmark, no link in an email and no test breaks —
 * which is what §5's "do not unnecessarily restructure backend routes" is
 * protecting.
 *
 * ## What is deliberately NOT in this list
 *
 * Two things came off the sidebar in this phase. Neither was removed from the
 * tree, and both still answer on their own addresses.
 *
 * **The kitchen board.** /kitchen still exists and KITCHEN staff still land on
 * it; it is off the owner's sidebar because the owner is not the person making
 * the cake. §3 is the correction: the admin confirms orders and decides who
 * bakes them, and the bench work belongs to whoever is at the bench. A partner
 * bakery now has a board of its own at /vendor, drawn from the *vendor* state
 * machine rather than this one.
 *
 * **The builder's option pages.** /admin/catalog and everything under it is
 * untouched and still reachable by address: `priceCake` reads those rows, the
 * 3D builder quotes from them, and every order placed before CakeProduct was
 * written against them. They are off the sidebar because the builder is switched
 * off (lib/flags), and a catalogue offering an owner four pages of sponge and
 * topping prices that no customer can currently choose from is four pages of
 * work with no effect on anything for sale. §15: take them out of the active
 * workflow, leave the implementation alone. When the builder comes back, so do
 * those five lines.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Which icon in components/admin/icons.tsx draws this. */
  icon: string;
  /**
   * Match this item as current for any path beneath it, not just an exact hit.
   *
   * Off for /admin, which is a prefix of every other route here and would
   * otherwise be permanently highlighted.
   */
  nested?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: "home" }],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/orders", label: "Orders", icon: "orders", nested: true },
      /*
       * Operations rather than Business, and beside Orders rather than beside
       * Staff. A vendor is not a person the shop employs and not a setting
       * somebody touches twice a year — deciding who bakes today's order is the
       * same morning's work as reading the order book, which is what this
       * section is.
       */
      /*
       * The delivery *board* — what is going out today — rather than the
       * delivery *settings* below it. Two different jobs sharing a word: one is
       * read every morning with a van outside, the other is touched when a rider
       * is hired. Above Vendors, because the day comes before who is baking it.
       *
       * Not `nested`, because the route sits under /admin/orders and marking it
       * as a prefix would light this item up on every order's detail page. An
       * exact hit is the right rule for a board with one address.
       */
      { href: "/admin/orders/today", label: "Deliveries", icon: "delivery" },
      { href: "/admin/vendors", label: "Vendors", icon: "vendor", nested: true },
      /* Renamed from "Delivery", which read as though it were the board above.
         The route is untouched — §5's "do not unnecessarily restructure backend
         routes" is about addresses, and this is a word on a sidebar. */
      { href: "/admin/delivery", label: "Slots & zones", icon: "pricing", nested: true },
    ],
  },
  {
    label: "Catalogue",
    items: [
      /*
       * The cakes customers buy, and the first item in this section because it
       * is the one an owner opens.
       *
       * It used to be "/admin/catalog/cakes", which was the shape-and-size
       * *options* the 3D builder assembles a cake from — a page that answered
       * "what does a hexagon cost" under a label that promised Chocolate
       * Truffle. §20 is about exactly that confusion: an administrator must not
       * be led to think they change the cake a customer sees by editing catalog
       * options. So "Cakes" now means cakes, and it is the only thing in this
       * section: with the 3D builder switched off, a preset cake is the whole of
       * what the shop sells. The header note says where the builder's option
       * pages went and why they are still there.
       */
      { href: "/admin/cakes", label: "Cakes", icon: "cake", nested: true },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/admin/settings", label: "Bakery", icon: "bakery", nested: true },
      { href: "/admin/staff", label: "Staff", icon: "staff", nested: true },
    ],
  },
];

/**
 * Every route that belongs to exactly one item, which is how a nested item knows
 * when not to claim a path.
 *
 * Deliveries lives at /admin/orders/today — under the prefix Orders matches —
 * so without this both would light up at once, and a sidebar with two current
 * items has stopped saying where you are. Read off NAV rather than listed, so an
 * item added below joins it without an edit here.
 */
const OWNED = new Set(
  NAV.flatMap((s) => s.items).filter((i) => !i.nested).map((i) => i.href),
);

/** Whether a nav item should be marked as the page you are on. */
export function isCurrent(item: NavItem, pathname: string): boolean {
  if (!item.nested) return pathname === item.href;
  /* A prefix match, except on a path some other item owns outright. Order detail
     (/admin/orders/MC-4471) is still Orders; the delivery board is not. */
  return pathname.startsWith(item.href) && !OWNED.has(pathname);
}

/* ------------------------------------------------------------- catalogue */

/**
 * The ten option categories, grouped and renamed for somebody who runs a bakery.
 *
 * This is the whole of §23 — "the admin should never need to understand
 * database IDs, is_active, base_price" — applied to the one place it is hardest,
 * which is the catalogue's own vocabulary. The database calls these `shape`,
 * `sponge`, `placement`; an owner calls them the cake's shape, what it's made
 * of, and where the fruit goes. `CatalogCategory` is not renamed to suit, both
 * because it mirrors lib/schema.ts's Zod enums and because renaming an enum to
 * improve a label is how a schema stops describing the product.
 *
 * ## Why four groups rather than the brief's three
 *
 * §5 asks for Cakes / Ingredients / Add-ons / Pricing, and the first three do
 * not divide ten categories evenly on their own — `delivery` belongs to none of
 * them, and it already has a page of its own with zones and lead times on it, so
 * it stays there rather than being dragged into the catalogue to satisfy a
 * grouping.
 *
 * ## What these are NOT
 *
 * They are not the cakes a customer buys. That used to be a gap this note
 * defended at length — "those are lib/presets.ts, plain CakeConfig objects
 * whose prices are computed from the options below" — and the defence was
 * honest while the 3D builder was the product. With the builder switched off it
 * left a bakery unable to reprice Chocolate Truffle without a deploy, which is
 * what CakeProduct and /admin/cakes now fix.
 *
 * So the ten categories below are the *builder's* parts list: what a filling
 * costs, what a finish costs in labour, what a shape adds. Repricing Belgian
 * Chocolate here changes what a cake somebody designs from scratch costs, and
 * changes nothing about a shop cake — a shop cake costs what /admin/cakes says
 * it costs. Both are still real and both are still edited; the groups below are
 * named so it is obvious which is which.
 *
 * Nothing here has been deleted or rerouted. `priceCake` reads these, the
 * builder quotes from them, and every order placed before the product table was
 * written against them.
 */
export interface CategoryMeta {
  category: CatalogCategory;
  /** What an owner calls it, singular. */
  label: string;
  /** Plural, for a section heading. */
  plural: string;
  /** One line under the heading. What deciding about these actually decides. */
  blurb: string;
  /**
   * Whether a photograph makes sense for this category.
   *
   * False for `coverage`, `placement` and `size`, and this is a judgement worth
   * defending rather than an oversight. "Semi-naked", "Cascade" and "1 kg" are
   * not things you can photograph on their own — they are properties of an
   * arrangement — and offering an upload box for them would invite an owner to
   * put a picture of a whole cake behind the word "Naked", which then appears on
   * four options that are meant to be distinguishable. §21 is right that this is
   * an image-first business; it does not follow that every row is an image.
   */
  photo: boolean;
}

export const CATEGORY_META: Record<CatalogCategory, CategoryMeta> = {
  shape: {
    category: "shape",
    label: "Shape",
    plural: "Shapes",
    blurb: "The outline the cake is cut and built to.",
    photo: true,
  },
  size: {
    category: "size",
    label: "Size",
    plural: "Sizes",
    blurb: "Weight, and the price every other choice is scaled against.",
    photo: false,
  },
  sponge: {
    category: "sponge",
    label: "Sponge",
    plural: "Sponges",
    blurb: "What the cake itself is made of. Every layer is this.",
    photo: true,
  },
  filling: {
    category: "filling",
    label: "Filling",
    plural: "Fillings",
    blurb: "What goes between the layers.",
    photo: true,
  },
  frosting: {
    category: "frosting",
    label: "Frosting",
    plural: "Frostings",
    blurb: "What covers it, and what it costs to cover.",
    photo: true,
  },
  coverage: {
    category: "coverage",
    label: "Coverage",
    plural: "Coverage",
    blurb: "How much of the cake the frosting reaches.",
    photo: false,
  },
  finish: {
    category: "finish",
    label: "Finish",
    plural: "Finishes",
    blurb: "The surface treatment, priced as the labour it takes.",
    photo: true,
  },
  topping: {
    category: "topping",
    label: "Topping",
    plural: "Toppings",
    blurb: "What lands on top, priced per piece.",
    photo: true,
  },
  placement: {
    category: "placement",
    label: "Placement",
    plural: "Placements",
    blurb: "Where the toppings go. Arrangement, not an ingredient.",
    photo: false,
  },
  delivery: {
    category: "delivery",
    label: "Delivery slot",
    plural: "Delivery slots",
    blurb: "What each slot promises, and what it costs.",
    photo: false,
  },
};

/** One catalogue page, and the categories it is responsible for. */
export interface CatalogGroup {
  slug: "cakes" | "ingredients" | "addons" | "pricing";
  title: string;
  blurb: string;
  categories: CatalogCategory[];
}

export const CATALOG_GROUPS: CatalogGroup[] = [
  {
    slug: "cakes",
    title: "Shape & size",
    blurb:
      "Builder options: the shape and size of a cake somebody designs from "
      + "scratch, how far the frosting goes and how the surface is finished. A "
      + "size's price is the base every other choice is added to. These do not "
      + "set the price of a cake in the shop \u2014 that lives under Cakes.",
    categories: ["shape", "size", "coverage", "finish"],
  },
  {
    slug: "ingredients",
    title: "Ingredients",
    blurb:
      "Builder options: what a cake is made of. Each price is the difference "
      + "from the plainest version, scaled by the size ordered.",
    categories: ["sponge", "filling", "frosting"],
  },
  {
    slug: "addons",
    title: "Toppings",
    blurb:
      "Builder options: what goes on top, and where it goes. Priced per piece.",
    categories: ["topping", "placement"],
  },
  {
    slug: "pricing",
    title: "Charges & tax",
    blurb:
      "The charges that are formulas rather than choices \u2014 extra tiers, extra "
      + "layers, piping, drip \u2014 plus tax and the smallest order the kitchen "
      + "will take. Piping and tax apply to shop cakes too.",
    categories: [],
  },
];

/** Which catalogue page a category is edited on. */
export function groupFor(category: CatalogCategory): CatalogGroup | undefined {
  return CATALOG_GROUPS.find((g) => g.categories.includes(category));
}

/** The editor for one option. */
export function optionHref(category: CatalogCategory, value: string): string {
  return `/admin/catalog/option/${category}/${encodeURIComponent(value)}`;
}

/**
 * What the price field on this category actually means, in the owner's words.
 *
 * `priceInputPaise` is one column with a per-category meaning — a base price for
 * a size, a delta everywhere else — which prisma/schema.prisma explains at
 * length and which Postgres cannot enforce. An owner should never have to hold
 * that distinction in their head, so the label on the field says which one they
 * are typing into.
 */
export function priceLabel(category: CatalogCategory): string {
  return category === "size" ? "Base price"
    : category === "delivery" ? "Delivery fee"
    : category === "topping" ? "Price per piece"
    : category === "finish" ? "Labour charge"
    : "Extra charge";
}

export function priceHint(category: CatalogCategory): string {
  return category === "size"
    ? "The starting price for a cake this size, before any other choice is added."
    : category === "delivery"
    ? "Charged on top of the cake. Zero is free delivery."
    : category === "topping"
    ? "Charged for each piece that goes on. Scaled up on a larger cake."
    : category === "finish"
    ? "What the hand-work costs. Scaled up on a larger cake."
    : category === "coverage" || category === "placement" || category === "shape"
    ? "Added to the cake's price. Zero means this choice costs nothing extra."
    : "Added on top of the base price, and scaled up on a larger cake. Zero means included.";
}
