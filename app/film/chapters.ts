/**
 * The seven chapters, in the order the cake gains things.
 *
 * The ladder is strictly one-way — bare, filled, covered, combed, dripped,
 * topped, cut. Nothing returns to a previous value, which is why no chapter
 * needs masking and why reordering them breaks the film rather than reshuffling
 * it: a comb cannot pass over frosting that has not arrived.
 */
export interface Chapter {
  id: string;
  /** What the frames show. Also the reduced-motion still's alt text. */
  shows: string;
  /**
   * Which TicketLine slugs print in this chapter. CH5 prints nothing new —
   * it appends the drip onto the line CH4 already printed, because a drip
   * lives on the Colour & finish step in this product.
   */
  prints: string[];
  /** Appends onto an already-printed line rather than printing a new one. */
  appends?: string;
  /** The kitchen's own line, where the chapter has one. */
  caption?: string;
}

export const CHAPTERS: Chapter[] = [
  {
    id: "stack",
    shows: "Three Belgian Chocolate sponge layers on a brushed-steel board, cherry compote thin in every seam",
    prints: ["shape", "size", "sponge"],
  },
  {
    id: "filling",
    shows: "The compote swelling and squeezing out at the edge of each seam",
    prints: ["filling"],
    caption: "SQUEEZED OUT OF A STACK, IT SLUMPS BEFORE IT SETS.",
  },
  {
    id: "frosting",
    shows: "Swiss Meringue rising from the base and closing over the top",
    prints: ["frosting"],
  },
  {
    id: "comb",
    shows: "Shallow ridges arriving up the side, the raking light catching each top edge",
    prints: ["finish"],
  },
  {
    id: "drip",
    shows: "Dark chocolate pooling at the rim and running down to seven or eight different lengths",
    prints: [],
    appends: "finish",
    caption: "NONE OF THEM REACH THE BOARD. THAT IS WHAT STOPS IT LOOKING PRINTED ON.",
  },
  {
    id: "toppings",
    shows: "Chocolate shards landing in a pile at the centre, cherries settling into a ring at the edge",
    prints: ["toppings", "message"],
    caption: "LEAVE IT EMPTY AND THE PLAQUE COMES OFF. THE TOPPINGS GET THE MIDDLE INSTEAD.",
  },
  {
    id: "cut",
    shows: "The cake cut open — dark crumb, two deep red bands, the frosting shell a real thickness at the cut",
    prints: ["review"],
  },
];

/**
 * The carbon callouts. CH1 measures the specimen; CH7 names what the cut face
 * shows. Both are HTML overlays projected onto the frame, not baked into it —
 * a generated frame that contained a single legible character would be a
 * generated frame with type in it, and there is none anywhere in this film.
 *
 * x/y are percentages of the specimen window.
 */
export interface Callout {
  chapter: string;
  label: string;
  /** Anchor on the cake, where the leader line starts. */
  x: number;
  y: number;
  /** Which way the leader runs to reach its label. */
  side: "left" | "right";
}

export const CALLOUTS: Callout[] = [
  /*
   * Anchors are percentages of the specimen window, measured off the built
   * frames rather than guessed: the bare stack sits x 32–77%, y 40–78% with its
   * compote seams at y 56% and 66%, and the cut face's sponge, compote, shell
   * and crumbs were located by colour in public/film/cut.webp. A leader line
   * that points at nothing is worse than no leader line.
   */
  /* The long label goes left and the short one right: a right-side callout has
     only (100 - x)% of the window to run into, and "203 × 203 × H110" ran off
     the edge of the specimen from the cake's right shoulder. */
  { chapter: "stack", label: "203 × 203 × H110", x: 32, y: 45, side: "left" },
  { chapter: "stack", label: "3 LAYERS", x: 78, y: 61, side: "right" },
  { chapter: "stack", label: "SERVES 12–15 AT 100 G A HEAD", x: 58, y: 83, side: "right" },
  { chapter: "cut", label: "SPONGE ×3", x: 44, y: 45, side: "left" },
  { chapter: "cut", label: "CHERRY COMPOTE", x: 47, y: 58, side: "left" },
  { chapter: "cut", label: "0.5mm BEVEL", x: 60, y: 36, side: "right" },
  { chapter: "cut", label: "SWISS MERINGUE 3mm", x: 65, y: 50, side: "right" },
  { chapter: "cut", label: "CRUMBS", x: 40, y: 77, side: "left" },
];

/**
 * Fallback chapter starts, as fractions of the film.
 *
 * These are only used before a frame track exists. The real numbers are written
 * into the track manifest by scripts/build-film.py from the actual spliced
 * durations, and the scrubber prefers those — shipping the template's timings is
 * how a caption ends up firing in the wrong chapter, so there is nowhere here to
 * hand-edit a number into.
 */
export const FALLBACK_STARTS = CHAPTERS.map((_, i) => i / CHAPTERS.length);
