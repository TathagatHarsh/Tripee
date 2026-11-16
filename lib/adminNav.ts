import type { CatalogCategory } from "@prisma/client";

/**
 * The portal's own map of itself.
 *
 * Here rather than inside the sidebar component because the sidebar is a client
 * component (it needs `usePathname`) while the breadcrumb, page titles and the
 * catalogue overview are server-rendered; a list inside the client component
 * would have to be duplicated for them. This file imports only a type, so it
 * costs the client bundle nothing.
 *
 * ## Groups
 *
 * Home, Orders, Bakeries, Catalogue, Settings: the jobs in the order of the
 * day. Orders and Bakeries are the morning, Catalogue is a Tuesday-afternoon
 * decision about what the shop sells, Settings is touched twice a year.
 *
 * ## Routes are reused, never restructured
 *
 * Every href already existed. Only grouping and labels changed, so no bookmark,
 * no link in an email and no test breaks.
 *
 * ## What is deliberately NOT in this list
 *
 * **The kitchen board.** /kitchen still exists and KITCHEN staff still land on
 * it; it is off the owner's sidebar because the owner confirms orders and
 * decides who bakes them. A partner bakery has a board of its own at /vendor.
 *
 * **The builder's option pages** under /admin/catalog/ingredients, /addons and
 * /pricing. They are a parts list for the 3D builder, which is switched off
 * (lib/flags), so linking four pages of sponge and topping prices that no
 * customer can currently choose from is work with no effect. "Options &
 * prices" below goes to the catalogue overview only. When the builder comes
 * back, the group pages are already there to link to.
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
  /** Shown only while a partner bakery is active; the owner baking alone has no use for it. */
  partnersOnly?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Home",
    items: [{ href: "/admin", label: "Home", icon: "home" }],
  },
  {
    label: "Orders",
    items: [
      { href: "/admin/orders", label: "Orders", icon: "orders", nested: true },
      /*
       * The delivery *board* — what is going out today — not the delivery
       * *settings* under Settings. Not `nested`: the route sits under
       * /admin/orders, and a prefix match would light this up on every order's
       * detail page.
       */
      { href: "/admin/orders/today", label: "Deliveries today", icon: "delivery" },
      { href: "/admin/custom-requests", label: "Custom requests", icon: "cake", nested: true },
      { href: "/admin/payments", label: "Payments", icon: "pricing", nested: true },
    ],
  },
  {
    label: "Bakeries",
    items: [
      /* A bakery is not an employee or a setting: deciding who bakes today's
         order is the same morning's work as reading the order book. */
      { href: "/admin/vendors", label: "Bakeries", icon: "vendor", nested: true },
      { href: "/admin/inventory", label: "Cake availability", icon: "cake", nested: true, partnersOnly: true },
    ],
  },
  {
    label: "Catalogue",
    items: [
      /*
       * The cakes customers buy (CakeProduct), not the builder's shape-and-size
       * options: §20 is about an owner being led to think editing options
       * changes the cake a customer sees.
       */
      { href: "/admin/cakes", label: "Cakes", icon: "cake", nested: true },
      { href: "/admin/catalog", label: "Options & prices", icon: "pricing", nested: true },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/admin/settings", label: "Shop", icon: "bakery", nested: true },
      /* Not the delivery board above; the route is untouched. */
      { href: "/admin/delivery", label: "Delivery slots", icon: "delivery", nested: true },
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
