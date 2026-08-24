import type { CakeConfig } from "./schema";

export interface Preset {
  slug: string;
  name: string;
  blurb: string;
  config: CakeConfig;
}

/**
 * The eighteen the bakery sells by name.
 *
 * These are *flavours*, which is a different axis from the eight below them —
 * those are design presets, chosen for shape, coverage and finish. A customer
 * asking for Lotus Biscoff is not asking for a hexagon; a customer asking for a
 * naked carrot cake is not asking about pistachio paste. Both belong on the
 * catalogue page and neither subsumes the other, so they are two lists that
 * concatenate rather than one list with two kinds of thing in it.
 *
 * Every one of them is an ordinary `CakeConfig` and nothing more. There is no
 * per-flavour model, no bespoke scene and no second renderer: the recognisable
 * identity of each cake comes out of the sponge, the filling, the frosting
 * colour, the finish, the drip and two or three garnishes, all of which the
 * builder already understands. That is the whole reason "Make it mine" can hand
 * the customer the exact cake they were looking at — see app/presets.
 *
 * Three constraints shaped these, and they are worth stating because they are
 * not obvious from reading the list:
 *
 *   · **One entry per topping kind.** `builder/ToppingBar` aims itself by kind
 *     and patches every spec that matches, so two entries of the same kind share
 *     one placement control and cannot be told apart. A preset that shipped
 *     `pineapple-chunk` twice would look right and be unusable the moment
 *     somebody opened it.
 *   · **One piece per surface, at each size.** Topping layers are placed
 *     independently — `Toppings.place` keeps pieces of the *same* kind apart and
 *     knows nothing about the others — so two garnishes of comparable size, both
 *     over the top, interleave and collide. `crown` and `top-ring` are the one
 *     pair that safely share the top face, because a pile in the middle and a ring
 *     at the edge are radially separated. The crumbs are the exception, and it is
 *     a real one rather than a loophole: a 5mm crumb pressed in at `sink` 0.3 is a
 *     dusting, so a nut or a biscuit landing on one hides it and nothing looks
 *     wrong. Two *pieces* on one face is what does not survive.
 *   · **A garnish must be a different value from what it sits on.** Obvious once
 *     stated and easy to miss while writing a palette: pale pistachios on pale
 *     pistachio cream, and ivory rasmalai on ivory saffron cream, both rendered
 *     as nothing at all. Where a flavour is monochrome by nature, the separation
 *     has to be put in on purpose — see the notes on Pistacho and Rasmalai.
 *   · **Rosette and ruffle bury what lands on them.** `FrostingShell` pipes the
 *     top face at `height + size * 0.16` while `Toppings.place` seats garnishes on
 *     the plain top at `height`, so anything on a rosette cake sits *under* the
 *     piping. Verified in the render, on the existing Kids' Funfetti preset as
 *     well as on two of these. Both flavours whose brief asked for rosettes take
 *     `rustic` instead until that interaction is fixed.
 *   · **Whipped cream leaves on pickup.** Not a renderer concern — see
 *     rules.whipped-cream-transit. The four cakes that are honestly whipped cream
 *     say pickup rather than shipping a warning with themselves.
 *
 * No messages. Six of the eight designs below carry none either, and for the
 * reason app/presets gives at length: what a cake says is the customer's
 * sentence, not the catalogue's.
 */
export const PREMIUM_FLAVOURS: Preset[] = [
  {
    slug: "pineapple-delight",
    name: "Pineapple Delight",
    blurb: "Four thin layers, crushed fruit between them, nothing heavy about it.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "pineapple", filling: "pineapple-crush",
      /*
       * Rustic, not the rosette the brief asks for, and this is a render finding
       * rather than a preference. Piped rosettes cover the top face as well as the
       * wall, and they stand 0.16 of their own size above it while the pineapple is
       * seated on the plain top — so the fruit ends up under the piping. Shot, it
       * was a field of cream with seven gold flecks showing through it.
       *
       * Swirled cream is the honest substitute rather than a downgrade: whipped
       * cream worked with a palette knife is what a light tropical cream cake
       * actually is, and the fruit reads against it.
       */
      frosting: "whipped-cream", coverage: "full", finish: "rustic",
      frostingColor: "#F6EFE0", hasDrip: false,
      /*
       * One garnish, scattered. A ring of the same fourteen pieces left the middle
       * of a 200mm cream disc empty and the fruit reading as a border rather than
       * as the cake's subject; scattered, the same count covers the face. Density
       * stays at 3 — the brief is explicit that this one must not be loaded up, and
       * the swirled cream is already carrying the decoration.
       */
      toppings: [{ kind: "pineapple-chunk", placement: "top-scatter", density: 3 }],
      eggless: true, sugarFree: false, delivery: "pickup",
    },
  },
  {
    slug: "caramel-butterscotch",
    name: "Caramel Butterscotch",
    blurb: "Caramel poured warm, so it runs a little before it sets.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "butterscotch", filling: "salted-caramel",
      frosting: "american-buttercream", coverage: "full", finish: "smooth",
      /* Scraped smooth rather than piped, because the drip is the decoration on
         this one and a rustic or rosette surface underneath it fights for the
         same attention. */
      /*
       * Lightened from #D9A961, then brought back down from #E6C994. A caramel drip
       * needs something to be a drip *against*, and #B07A38 running down the
       * original coat was two caramels within a stop of each other — the run was
       * there in the render and you had to look for it. #E6C994 fixed that and
       * overshot: under ACES at this exposure it printed as plain cream, and the
       * cake stopped being caramel-coloured at all. This sits between them, a
       * clear stop and a half above the drip and still unmistakably caramel.
       *
       * Which is also what the cake is in a kitchen: the drip is reduced further
       * than the frosting ever gets.
       */
      frostingColor: "#DFBE7E", hasDrip: true, dripColor: "#B07A38",
      toppings: [
        /*
         * Crown, not scatter. Shards are `flat: false`, so they take a fully
         * random orientation, and at density 2 on a wide top that meant five of
         * them landing more or less flat and reading as dark pentagons printed on
         * the frosting. Piled in the middle they lean on each other, which is both
         * how a shard cake is actually finished and the only way a random
         * orientation reads as deliberate.
         */
        { kind: "caramel-shard", placement: "crown", density: 3 },
        /* Crumbs go to 5. A crumb is 5mm, so density 3 scattered about twenty of
           them round a 640mm board edge — countable, which a crumb border never
           should be. Same change on the Biscoff and the pistachio. */
        { kind: "butterscotch-crunch", placement: "base-border", density: 5 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "lotus-biscoff",
    name: "Lotus Biscoff",
    blurb: "Spread through the layers, crumbed round the base, biscuit on top.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      /* Butterscotch sponge, not vanilla. Biscoff is a caramelised-sugar biscuit
         and browned butter with dark sugar is the closest thing in the catalogue
         to that flavour — and, since the sponge shows on the docket, the closest
         thing we can say honestly. */
      sponge: "butterscotch", filling: "biscoff-spread",
      frosting: "swiss-meringue", coverage: "full", finish: "smooth",
      frostingColor: "#DFC49B", hasDrip: true, dripColor: "#B07A38",
      toppings: [
        { kind: "biscoff-biscuit", placement: "top-ring", density: 3 },
        { kind: "biscoff-crumb", placement: "base-border", density: 5 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "pistacho",
    name: "Pistacho",
    blurb: "Iranian paste and no colouring. It is meant to look this pale.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 3,
      sponge: "pistachio", filling: "pistachio-cream",
      /*
       * Smooth, and this is the one place a brief was read against itself.
       *
       * It asks for cream rosettes and then asks for the cake to be sophisticated
       * and minimal, and `rosette` is not a few rosettes — it is piped spirals
       * over the entire surface, which is the least minimal finish in the
       * catalogue. Pineapple Delight and Black Forest take the rosettes, where
       * nothing is competing with them. This one takes the restraint.
       */
      frosting: "swiss-meringue", coverage: "full", finish: "smooth",
      frostingColor: "#B6C79B", hasDrip: false,
      /*
       * The crumb went from the board to the top, which is where a pistachio cake
       * is finished anyway — and it is what makes the restraint above affordable.
       * Smooth sides plus a ring of fourteen nuts left most of a 200mm cream disc
       * empty, and "minimal" and "unfinished" are not the same picture.
       */
      toppings: [
        { kind: "pistachio-nut", placement: "top-ring", density: 3 },
        { kind: "pistachio-crumb", placement: "top-scatter", density: 4 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "berry-forest",
    name: "Berry Forest",
    blurb: "Scraped thin, so the berry layers show through the sides.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "vanilla", filling: "raspberry-compote",
      /* Semi-naked is the whole answer to "visible berry layers": a full coat
         hides the four bands of compote that are the point of this cake, and a
         fully naked one cannot take the fruit on top. */
      frosting: "whipped-cream", coverage: "semi-naked", finish: "rustic",
      frostingColor: "#F6EFE1", hasDrip: false,
      /* Three, on three separate surfaces: a pile in the middle, halved
         strawberries round the edge of the top, blueberries on the board. */
      toppings: [
        { kind: "mixed-berry", placement: "crown", density: 4 },
        { kind: "strawberry", placement: "top-ring", density: 2 },
        { kind: "blueberry", placement: "base-border", density: 2 },
      ],
      eggless: true, sugarFree: false, delivery: "pickup",
    },
  },
  {
    slug: "vancho",
    name: "Vancho",
    blurb: "Vanilla and chocolate in the same crumb, ivory on the outside.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      /* Marble is Vancho. The sponge is described in the catalogue as vanilla and
         chocolate swirled rather than layered, which is the flavour exactly, and
         it is what keeps this from being a chocolate cake with a pale coat. */
      sponge: "marble", filling: "chocolate-mousse",
      frosting: "white-ganache", coverage: "full", finish: "smooth",
      frostingColor: "#F0E4CF", hasDrip: true, dripColor: "#3B2318",
      toppings: [
        { kind: "chocolate-curl", placement: "crown", density: 4 },
        { kind: "white-chocolate-curl", placement: "base-border", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "american-blueberry",
    name: "American Blueberry",
    blurb: "Compote in the layers, whole fruit piled on the top.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "vanilla", filling: "blueberry-compote",
      frosting: "american-buttercream", coverage: "full", finish: "smooth",
      /* The glaze the brief asks for, as a drip in fruit colour rather than
         chocolate. `dripColor` is a free hex, so it does not have to come from
         DRIP_PALETTE — and a violet run down an ivory side is the one thing that
         stops this reading as a plain vanilla cake with berries on it. */
      /* Pulled back from #5B3E7A, which rendered as a vivid violet enamel rather
         than as fruit — the brief asks for a *subtle* glaze, and a blueberry
         reduction is closer to slate than to purple. */
      frostingColor: "#F7F0E3", hasDrip: true, dripColor: "#4C3D66",
      toppings: [
        { kind: "blueberry", placement: "crown", density: 4 },
        /* The "few cream rosettes" — a meringue kiss is a piped swirl, dried, so
           it is what a rosette looks like once it can be picked up. It brings an
           eggless caveat with it, which the docket states rather than hides. */
        { kind: "meringue-kiss", placement: "top-ring", density: 2 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "death-by-chocolate",
    name: "Death by Chocolate",
    blurb: "Four chocolate layers and three kinds of chocolate on the outside.",
    config: {
      version: 1,
      /* The only 2kg in the twelve. This is the richest thing on the page and it
         has to look it standing next to eleven neighbours — at 1.5kg it was the
         same silhouette as the truffle cake three cards along. */
      shape: "round", size: "2kg", tiers: 1, layers: 4,
      sponge: "belgian-chocolate", filling: "chocolate-mousse",
      frosting: "dark-ganache", coverage: "full", finish: "smooth",
      /* `dark-ganache` is fixedColor, so the renderer ignores this — it is here
         for the fallback silhouette PresetCakeViewer draws before the scene
         loads, which reads the frosting colour straight off the config. */
      frostingColor: "#3B2318",
      /* Milk over dark. A dark drip on dark ganache is invisible, which is what
         the drip on the older Classic Truffle preset actually is; the brief asks
         for several chocolate tones and this is where the second one goes. */
      hasDrip: true, dripColor: "#6B4A32",
      toppings: [
        { kind: "truffle", placement: "top-ring", density: 3 },
        { kind: "chocolate-shard", placement: "crown", density: 3 },
        { kind: "chocolate-curl", placement: "base-border", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "black-forest",
    name: "Black Forest",
    blurb: "Dark chocolate outside, cherries in their own syrup inside.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "belgian-chocolate", filling: "cherry-compote",
      /*
       * Coated dark, which is not what a Schwarzwälder Kirschtorte is.
       *
       * The textbook cake is whipped cream on the outside with shavings pressed
       * into it, and that is what this preset used to be — and what it looked like
       * on the catalogue page was a white cake with some dark specks on top. Every
       * bakery on this list sells "black forest" meaning a chocolate-coated cake
       * with cherries, the customer arrives expecting the thing they have bought
       * before, and a card that reads white when they asked for black is wrong in
       * the only way that matters. Coated dark.
       *
       * Rustic rather than smooth: worked coating, not a poured shell, so it still
       * reads as cream that happens to be chocolate rather than as ganache.
       */
      frosting: "dark-ganache", coverage: "full", finish: "rustic",
      frostingColor: "#3B2318", hasDrip: false,
      toppings: [
        { kind: "cherry", placement: "top-ring", density: 3 },
        /*
         * White curls, where the traditional cake has dark shavings — and the
         * reason is the one this file keeps running into. A garnish has to be a
         * different value from what it sits on, and dark chocolate shavings on a
         * #3B2318 coat render as nothing at all. White chocolate on dark is both
         * visible and what the chocolate-coated version of this cake is actually
         * sold wearing.
         */
        { kind: "white-chocolate-curl", placement: "crown", density: 4 },
      ],
      /* No longer whipped cream, so no longer pickup-only — see
         rules.whipped-cream-transit. Ganache travels. */
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "rasmalai",
    name: "Rasmalai",
    blurb: "Saffron sponge soaked in rabri. Pistachio and almond on the top.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "saffron", filling: "rabri",
      frosting: "american-buttercream", coverage: "full", finish: "smooth",
      /*
       * Deepened from #F0E2C6, which was the single worst thing about this cake.
       *
       * At that value the coat, the patties and the almonds were three shades of
       * the same ivory, and the whole render came back as a plain white drum: the
       * saffron the flavour is named for was nowhere, and neither were two of its
       * three garnishes. The frosting carries the saffron now and everything on it
       * is chosen to sit off that — whiter patties, green crumb, pale almonds moved
       * down onto the board.
       *
       * Deepened twice, because the first step was not enough to survive the print.
       * A pale warm colour metered at this exposure comes back most of the way to
       * white, so a saffron cream has to be mixed noticeably stronger than the one
       * you are picturing. Saturation 0.61 of a possible 0.65 — near the top of what
       * lib/color will let a kitchen claim it can hit, which is the right place for
       * the one flavour whose whole identity is a colour.
       */
      frostingColor: "#E3C98D", hasDrip: false,
      /*
       * Patties round the edge, crumb over the top, almonds on the board.
       *
       * The first arrangement put the patties in a crown and the almonds in a ring,
       * to keep two pieces off one annulus. It solved a collision that could not
       * happen — the almonds were invisible — and cost the cake its only two
       * legible garnishes: a pile of ivory discs in the middle of an ivory top is
       * a lump, and a ring of 1mm-thick ivory slivers is nothing. Value drives the
       * layout here, not geometry.
       */
      toppings: [
        { kind: "rasmalai-disc", placement: "top-ring", density: 2 },
        { kind: "pistachio-crumb", placement: "top-scatter", density: 4 },
        { kind: "almond-sliver", placement: "base-border", density: 4 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "tiramisu-chocolate",
    name: "Tiramisu Chocolate",
    blurb: "Mascarpone whipped with espresso, finished in cocoa.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "belgian-chocolate", filling: "chocolate-mousse",
      /*
       * Cream cheese, not ganache, and that single choice is what keeps this off
       * the "standard chocolate cake" the brief warns about.
       *
       * Mascarpone *is* a cream cheese, so the material is right on the label as
       * well as on the render: cream cheese carries no clearcoat and sits at 0.48
       * roughness, so an espresso-brown coat of it reads as a matte, cocoa-dusted
       * cream. The same colour on dark ganache would be wet, glossy chocolate.
       */
      frosting: "cream-cheese", coverage: "full", finish: "smooth",
      /*
       * Greyer than the #8A6A52 this started at, and less of it. That colour is
       * milk chocolate — it rendered as exactly the standard chocolate cake the
       * brief warns against. Cocoa dust on mascarpone is a desaturated, slightly
       * cool brown, and it is *dark*: dropping saturation from 0.25 to 0.17 and
       * lightness from 0.43 to 0.37 is what separates "dusted in cocoa" from
       * "coated in chocolate".
       *
       * The material carries the rest of the distinction, and it is the half that
       * cannot be faked with a hex. Cream cheese has no clearcoat and sits at 0.48
       * roughness; dark ganache has 0.42 of clearcoat at 0.26. Next to the truffle
       * cake three cards along, this one is matte and that one is wet — which is
       * exactly the difference between dusted and coated.
       */
      frostingColor: "#6E5A4E", hasDrip: true, dripColor: "#3B2318",
      toppings: [
        { kind: "chocolate-shard", placement: "crown", density: 3 },
        { kind: "chocolate-curl", placement: "base-border", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "chocolate-truffle",
    name: "Chocolate Truffle",
    blurb: "Ganache set firm, and truffles rolled the same morning.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "belgian-chocolate", filling: "chocolate-mousse",
      frosting: "dark-ganache", coverage: "full", finish: "smooth",
      frostingColor: "#3B2318", hasDrip: true, dripColor: "#6B4A32",
      toppings: [
        { kind: "truffle", placement: "top-ring", density: 3 },
        { kind: "chocolate-curl", placement: "crown", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  /*
   * The six below came off the bakery's own flavour list and had no card. They are
   * built the same way the twelve above are — sponge, filling, frosting colour,
   * finish, drip and two garnishes, all of it vocabulary the builder already has,
   * so "Make it mine" hands over exactly what the photograph shows.
   *
   * Two things the list asks for that the catalogue cannot say yet, both recorded
   * here rather than papered over:
   *
   *   · **There is no chocolate chip.** `Topping` has curls, shards, truffles and
   *     ferreros, and a chip is none of those. Choco Chips uses a dense scatter of
   *     shards, which is the right size and the wrong shape. A `chocolate-chip`
   *     kind is the fix; until then the docket says "chocolate shard", which is at
   *     least true about what is on the cake.
   *   · **There is no plain biscuit crumb.** A cheesecake stands on a crushed
   *     biscuit base and the only crumbs in the catalogue are Biscoff and
   *     pistachio. Naming either on a blueberry cheesecake would put a flavour on
   *     the docket that is not in the cake, so the two fruit cheesecakes take
   *     `oreo` at the base — a real base, honestly named — and only the Biscoff
   *     cheesecake gets `biscoff-crumb`, where it is what is actually in there.
   *
   * 1kg, where the twelve above are mostly 1.5kg. The bakery's list sells these at
   * 1kg and 500g, so that is what a card for them should open at; size is step 2 of
   * the builder either way.
   */
  {
    slug: "choco-chips",
    name: "Choco Chips",
    blurb: "Chips through the crumb and scattered over the top. Nothing subtle.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      sponge: "vanilla", filling: "chocolate-mousse",
      frosting: "american-buttercream", coverage: "full", finish: "smooth",
      frostingColor: "#F2E6D0", hasDrip: true, dripColor: "#3B2318",
      toppings: [
        /*
         * Truffles, where the first cut of this used shards — and the note above
         * about there being no chocolate chip is why. Both are the wrong shape; the
         * question is which is the wrong shape at the right size. `chocolate-shard`
         * renders as slabs standing up off the top face, so a dense scatter of them
         * came back looking like the Death by Chocolate crown spread thin. A
         * truffle is a small dark lump sitting on the surface, which is what a chip
         * looks like from a foot away.
         *
         * Scattered, not piled: chips are spread over the whole top face, so the
         * placement is doing as much work here as the kind.
         */
        { kind: "truffle", placement: "top-scatter", density: 5 },
        { kind: "chocolate-curl", placement: "base-border", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "white-forest",
    name: "White Forest",
    blurb: "The pale twin. White chocolate instead of dark, same cherries.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      sponge: "vanilla", filling: "cherry-compote",
      frosting: "white-ganache", coverage: "full", finish: "rustic",
      /*
       * #E7D6B8 — a buttermilk, well down from the ivory the other pale cakes on
       * this list wear. Not a preference: the crown is white chocolate, and white on
       * white is the failure this file keeps writing notes about. Shot at #EFE1C9
       * the curls were not dim, they were absent, and the top of the cake was a
       * blank disc with cherries round the rim. Two more steps down and they exist.
       * The cherries were never the problem.
       */
      frostingColor: "#E7D6B8", hasDrip: false,
      toppings: [
        { kind: "cherry", placement: "top-ring", density: 3 },
        { kind: "white-chocolate-curl", placement: "crown", density: 4 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "blueberry-cheesecake",
    name: "Blueberry Cheesecake",
    blurb: "Baked on a crushed biscuit base, compote folded through.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      sponge: "vanilla", filling: "blueberry-compote",
      frosting: "cream-cheese", coverage: "full", finish: "smooth",
      /*
       * The slate-violet drip is lifted from American Blueberry, where it was
       * measured rather than picked — a blueberry reduction is closer to slate than
       * to purple, and #5B3E7A rendered as violet enamel.
       *
       * These two cakes are cousins and the client's list has both, so the card has
       * to separate them: that one is buttercream with the fruit piled in a crown
       * and meringue round it, this one is cream cheese, scraped smooth, fruit in a
       * ring, and a dark ring of biscuit at the base. The base is the tell.
       */
      frostingColor: "#F3E9D3", hasDrip: true, dripColor: "#4C3D66",
      toppings: [
        { kind: "blueberry", placement: "top-ring", density: 4 },
        { kind: "oreo", placement: "base-border", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "strawberry-cheesecake",
    name: "Strawberry Cheesecake",
    blurb: "Cream cheese, biscuit base, coulis run down the sides.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      sponge: "vanilla", filling: "strawberry-jam",
      frosting: "cream-cheese", coverage: "full", finish: "smooth",
      /* #B03A32 rather than a brighter red: this is a cooked coulis, and the same
         push that sends red velvet vermilion sends a strawberry glaze to poster
         paint. */
      frostingColor: "#F5EBDA", hasDrip: true, dripColor: "#B03A32",
      toppings: [
        { kind: "strawberry", placement: "top-ring", density: 3 },
        { kind: "oreo", placement: "base-border", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "purple-velvet",
    name: "Purple Velvet",
    blurb: "Blackcurrant through a velvet crumb. Cream cheese over the top.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      /*
       * Red velvet sponge, because that is what purple velvet is — the same cake
       * with a different colouring — and the catalogue has no purple sponge to
       * claim instead. `blueberry-compote` stands in for blackcurrant for the same
       * reason: it is the nearest thing on the list, and the docket names what is
       * really in the cake rather than what the cake is called.
       */
      sponge: "red-velvet", filling: "blueberry-compote",
      frosting: "cream-cheese", coverage: "full", finish: "smooth",
      /* The one saturated cake on the list, so the garnishes have to come off it
         rather than sit in it: white chocolate at the base reads immediately, and
         mixed berries on the top are dark enough to hold their own edges. */
      frostingColor: "#6E5080", hasDrip: false,
      toppings: [
        { kind: "mixed-berry", placement: "top-ring", density: 3 },
        { kind: "white-chocolate-curl", placement: "base-border", density: 3 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "biscoff-cheesecake",
    name: "Biscoff Cheesecake",
    blurb: "Biscuit base, biscuit on top, cream cheese in between.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      /* `cookie-crumb`, not `biscoff-spread`. The spread belongs to Lotus Biscoff
         above, where it runs through the layers; what makes this one a cheesecake
         is the crushed biscuit it is built on. */
      sponge: "butterscotch", filling: "cookie-crumb",
      frosting: "cream-cheese", coverage: "full", finish: "smooth",
      /*
       * Paler than Lotus Biscoff's #DFC49B and with no drip, which is the whole of
       * how these two are told apart at card size: that one is a caramel-bodied cake
       * with caramel running down it and the biscuits laid out in a ring, this is a
       * pale cheesecake with them piled in the middle.
       *
       * The crumb is at the base and not, as first shot, ringing the top edge. On
       * the top edge a 5mm crumb at this camera distance is a row of dots and reads
       * as a mistake; round the base it reads as the biscuit the cheesecake is
       * standing on, which is the true thing about it.
       */
      frostingColor: "#EFE0C6", hasDrip: false,
      toppings: [
        { kind: "biscoff-biscuit", placement: "crown", density: 5 },
        /*
         * The caramelised-sugar crunch, and it is here because without it this cake
         * was three biscuits lying flat on a white disc — a pale cheesecake with no
         * drip has nothing else going on, and "restrained" and "unfinished" are one
         * pixel apart at card size. It is also true about a Biscoff cheesecake,
         * which is the only reason it is allowed on.
         *
         * `crown` plus `top-ring` is the one pair that safely shares the top face:
         * a pile in the middle and a ring at the edge are radially separated, so
         * `Toppings.place` cannot interleave them.
         */
        { kind: "butterscotch-crunch", placement: "top-ring", density: 3 },
        { kind: "biscoff-crumb", placement: "base-border", density: 5 },
      ],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
];

/**
 * The four design presets. Chosen for shape, coverage and finish rather than for
 * flavour — see the note on PREMIUM_FLAVOURS for why the two lists stay separate.
 */
export const SIGNATURE_DESIGNS: Preset[] = [
  {
    slug: "classic-truffle",
    name: "Classic Truffle",
    blurb: "The one everybody orders, done properly.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      sponge: "belgian-chocolate", filling: "chocolate-mousse",
      frosting: "dark-ganache", coverage: "full", finish: "smooth",
      frostingColor: "#3B2318", hasDrip: true, dripColor: "#3B2318",
      toppings: [{ kind: "chocolate-curl", placement: "top-ring", density: 3 }],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "strawberry-cream",
    name: "Strawberry & Cream",
    blurb: "Light, seasonal, gone in ten minutes.",
    config: {
      version: 1,
      shape: "round", size: "1kg", tiers: 1, layers: 3,
      sponge: "vanilla", filling: "strawberry-jam",
      frosting: "whipped-cream", coverage: "full", finish: "rustic",
      frostingColor: "#F7F1E6", hasDrip: false,
      toppings: [{ kind: "strawberry", placement: "top-ring", density: 3 }],
      eggless: true, sugarFree: false, delivery: "pickup",
    },
  },
  {
    slug: "red-velvet-classic",
    name: "Red Velvet",
    blurb: "Cream cheese scraped back, so the red layers show through.",
    config: {
      version: 1,
      shape: "round", size: "1.5kg", tiers: 1, layers: 4,
      sponge: "red-velvet", filling: "none",
      /*
       * `semi-naked`, and this is the whole fix.
       *
       * Fully coated, this cake was the weakest card in the catalogue by a long
       * way: cream cheese is #F8F0E2 and the sides were combed, so the most
       * distinctive sponge on the list rendered as a plain pale drum with somebody
       * else's name under it. The red velvet is the entire proposition and none of
       * it was visible. The gallery used to work around that by photographing this
       * one cut open, which fixed the picture and not the cake — and it cost the
       * catalogue its one-camera-for-everything rule.
       *
       * Scraping the coat off puts the red where it belongs: on the outside of the
       * cake, in the render, on the card, and on the cake the kitchen actually hands
       * over.
       *
       * `naked` rather than `semi-naked`, and that was measured, not preferred.
       * Semi-naked leaves a thin coat over the sponge, and a thin coat of #F8F0E2
       * over #8B2E20 renders salmon — the layers were legible and the colour was
       * not, which is halfway to the same complaint. Bare sides give the sponge's
       * own value. The cream cheese has not gone anywhere; it is between the four
       * layers, which is where a naked cake shows it off.
       *
       * One thing this closes off: rules.naked-drip forbids a drip on a naked cake,
       * so if this ever wants a coulis run down it, the coverage has to come back
       * up first.
       *
       * `rustic` follows from it: combing is a pattern dragged through a full coat,
       * so it has nothing to bite on once the sides are scraped.
       */
      frosting: "cream-cheese", coverage: "naked", finish: "rustic",
      frostingColor: "#F8F0E2", hasDrip: false,
      toppings: [{ kind: "chocolate-curl", placement: "base-border", density: 2 }],
      eggless: true, sugarFree: false, delivery: "standard",
    },
  },
  {
    slug: "two-tier-celebration",
    name: "Two-Tier Celebration",
    blurb: "For a birthday that matters. Swiss meringue holds it.",
    config: {
      version: 1,
      shape: "round", size: "2kg", tiers: 2, layers: 3,
      sponge: "vanilla", filling: "salted-caramel",
      frosting: "swiss-meringue", coverage: "full", finish: "smooth",
      frostingColor: "#EAC7C0", hasDrip: true, dripColor: "#B07A38",
      toppings: [
        { kind: "macaron", placement: "crown", density: 3 },
        { kind: "gold-leaf", placement: "top-scatter", density: 1 },
      ],
      message: "Happy Birthday",
      eggless: false, sugarFree: false, delivery: "standard",
    },
  },
];

/** The catalogue, flavours first: they are what a customer arrives asking for. */
export const PRESETS: Preset[] = [...PREMIUM_FLAVOURS, ...SIGNATURE_DESIGNS];

/**
 * The three the landing page prints as full-page photographs.
 *
 * By slug rather than by position. It was `PRESETS.slice(0, 3)`, which was fine
 * while there was one list and stopped being fine the moment another went in front
 * of it: components/PresetCard art-directs exactly these three by name — camera,
 * crop, backdrop, one of them cut open — and a slice takes whatever happens to be
 * first and renders it through the fallback, which is the identical record shot
 * three times. That is the "three placeholders" failure PresetCard's own note is
 * about, reintroduced by a reordering somewhere else in the file.
 */
export const LANDING_SLUGS = [
  "classic-truffle", "strawberry-cream", "red-velvet-classic",
] as const;

export function presetBySlug(slug: string): Preset | undefined {
  return PRESETS.find(p => p.slug === slug);
}

export const LANDING_PRESETS: Preset[] =
  LANDING_SLUGS.map(slug => presetBySlug(slug)!);
