import type { Metadata } from "next";
import Link from "next/link";
import { PresetCakeViewer } from "@/components/PresetCakeViewer";
import type { Shot } from "@/components/three/CakeScene";
import { LoadConfig } from "@/components/builder/LoadConfig";
import { PRESETS } from "@/lib/presets";
import { priceCake } from "@/lib/pricing";
import { formatINR } from "@/lib/format";
import { servingsLabel } from "@/lib/servings";
import { btn, eyebrow } from "@/lib/ui";

/**
 * The catalogue shot.
 *
 * One camera for all eight, which is the opposite of the landing page's three
 * cards — see components/PresetCard, where each gets a photograph of its own.
 * The reasoning inverts because the job does. Three cards on a marketing page
 * have to look like three different pieces of work; eight cakes in a catalogue
 * have to be *comparable*, and the thing a customer is choosing between is the
 * cake, not the crop. Change the lens per row and every difference on the page
 * becomes ambiguous — is that cake wider, or just closer?
 *
 * It has to be a turn-safe frame as well as a consistent one. An art-directed
 * crop can be tight because the silhouette is known; a cake on a turntable
 * presents its widest profile in every direction, so the frame has to hold the
 * widest one. `contain` fits both axes off `cakeFocus`, whose radius comes from
 * `footprintRadius` — the circumradius, which is exactly the extent that does
 * not change as a square or a hexagon turns.
 *
 * 23 degrees above the horizon: high enough that a top-ring of strawberries or
 * a scatter of sprinkles reads as decoration rather than as a coloured edge, low
 * enough that the drips, the combed sides and the second tier keep their height.
 */
const GALLERY_SHOT: Shot = {
  elevation: 0.4,
  azimuth: 0,
  fit: "contain",
  /* 6% of air. Under 1.0 the board's near edge leaves the frame; much over it
     and the cake retreats into the middle of a beige square, which is what this
     page looked like when the well was a 230px letterbox. The card's own 1.03
     hover push-in has to fit inside this margin too. */
  fill: 1.22,
  offsetX: 0,
  /* Lifted, because in a frame this wide the fit is bound by the width and
     `Framing`'s standing look-at lift then puts every pixel of vertical slack
     above the cake — measured at 17% of the frame empty over the top while the
     board's near edge was cropped off the bottom. See Shot.offsetY. */
  offsetY: 0.24,
  exposure: 1.07,
};

/**
 * Where one cake needs a different print from the other seven. Exposure only,
 * with one exception — and both kinds are corrections, not art direction.
 *
 * A dark subject metered for a pale one comes out as a black wall: set ganache
 * is 16% lightness and the mirror glaze not much more, so both get the third of
 * a stop over that the landing hero gets for the same cake and the same reason.
 */
const GALLERY_TRIM: Record<string, Partial<Shot>> = {
  "classic-truffle": { exposure: 1.2 },
  "mirror-glaze-showpiece": { exposure: 1.15 },

  /*
   * Cut, and only this one.
   *
   * Whole, it was the weakest card on the page by a distance: cream-cheese
   * frosting is #F8F0E2 and the finish is combed, so at this size the most
   * distinctive sponge in the catalogue was a plain pale drum with somebody
   * else's name on it. The red velvet is the entire proposition and none of it
   * was visible. One cake in eight opened up is ordinary in a bakery window,
   * and it is the only honest way to photograph this one.
   *
   * `sliced` belongs to the shot rather than to the config — nothing here
   * changes what "Make it mine" loads, which is still a whole cake.
   */
  "red-velvet-classic": {
    sliced: true,
    /* Turned to look into the wedge. `geometry.DEFAULT_SLICE` centres the cut
       0.34rad off the front, and the turntable carries it round from there, so
       this is where the reveal starts rather than where it stays. */
    azimuth: 0.34,
    // Pushed, red velvet goes vermilion; the sponge is meant to read burgundy.
    exposure: 1.0,
  },
  /*
   * The one that is not exposure. `cakeFocus` reports a square cake's radius as
   * its *corner* distance, 1.42x the tier, while `Framing` reserves width for a
   * board at 1.36x — so the only square in the catalogue was framed for a board
   * that does not exist out there and came out a quarter smaller than its
   * neighbours. Corrected here, on the one cake it affects, rather than by
   * touching a fit that every screen in the app shares.
   *
   * Both numbers are measured off the rendered silhouette rather than reasoned
   * about. Its height binds before its width once the well is 4:3 — a square cake
   * tipped towards the lens is apparently *taller* than a round one of the same
   * size, because its corners add to the projected depth as well as to the width —
   * so it ends up slightly narrower than its neighbours, and pushing it wider
   * would push its corners out of the top of the frame.
   *
   * It needs less of a lift than the rest for the same reason: `offsetY` is in
   * radii, its radius is the corner distance, and the shared 0.24 lifted it
   * clean past centre while every round cake landed just under.
   */
  "kids-funfetti": { fill: 0.955, offsetY: 0.11 },
};

/** Every preset gets the catalogue shot; a few get a correction on top. */
function galleryShot(slug: string): Shot {
  return { ...GALLERY_SHOT, ...GALLERY_TRIM[slug] };
}

export const metadata: Metadata = {
  title: "Cakes we already know by heart — Makemycake",
  description: "Eight finished designs. Open one and change whatever you like.",
};

export default function PresetsPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="flex h-[78px] items-center justify-between gap-6 border-b border-rule px-4 sm:px-8 lg:px-14">
        <div className="flex min-w-0 items-center gap-3.5">
          <Link href="/" className="font-mono text-meta font-bold tracking-[0.2em]">
            MAKEMYCAKE
          </Link>
          <span aria-hidden className="hidden size-1 rounded-full bg-rule sm:block" />
          <span className="hidden font-mono text-micro tracking-[0.1em] text-steel sm:block">
            PRESETS
          </span>
        </div>
        <Link href="/build/shape" className={btn("primary", "md")}>
          Start from scratch
        </Link>
      </header>

      <main className="px-4 sm:px-8 lg:px-14">
        <div className="flex flex-col items-start justify-between gap-8 pt-14 pb-10 lg:flex-row lg:items-end lg:gap-16">
          <div className="flex flex-col gap-4">
            <span className={`${eyebrow} tracking-[0.22em]`}>
              {PRESETS.length} finished designs
            </span>
            <h1 className="text-display">
              Cakes we already <span className="italic">know by heart.</span>
            </h1>
          </div>
          <p className="max-w-[44ch] text-lede leading-relaxed text-steel">
            Every one of these is a real configuration, not a photograph. Open any
            of them and it lands in the builder exactly as shown — then change
            whatever you like.
          </p>
        </div>

        <ul
          className={
            "grid auto-rows-fr grid-cols-1 gap-6 border-t border-rule pt-10 pb-20 " +
            "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          }
        >
          {PRESETS.map((p) => (
            <li
              key={p.slug}
              className={
                "group flex flex-col overflow-hidden rounded-panel border border-rule " +
                "bg-paper shadow-elev-1 transition-[box-shadow,border-color,translate] " +
                /* `var(...)` spelled out. Tailwind v4 dropped the `[--x]`
                   shorthand, so `duration-[--dur-ui]` compiled to the literal
                   `transition-duration: --dur-ui` — invalid, silently 0s, and
                   every card on this page was snapping between states. */
                "duration-[var(--dur-ui)] ease-[var(--ease-out)] " +
                "hover:border-steel hover:shadow-elev-3 " +
                // The lift is motion, so it waits to be asked for.
                "motion-safe:hover:-translate-y-1"
              }
            >
              {/*
                4:3, arrived at by measuring rather than by taste.

                A single-tier cake on its board projects, at this camera height,
                about 2.9 units wide by 2.16 tall — an aspect of 1.35, which is
                4:3 to within a percent. Framed in a square the same cake fills
                90% of the width and 54% of the height, and the missing 46% is
                the empty stage this page was accused of. Framed 4:3 it fills
                about 90% of both. Seven of the eight presets are single-tier, so
                that is the frame the page is built for; the two-tier is taller
                than it is wide and comes out narrower and full-height, which is
                what a two-tier cake is supposed to look like next to seven
                single ones.

                A fixed ratio rather than a fixed height, so this holds at one,
                two, three and four columns without a breakpoint per column.
              */}
              <div className="cake-stage relative aspect-[4/3] overflow-hidden border-b border-rule">
                {/* The hover push-in is in the scene, not on this element — see
                    three/Turntable.HOVER_SCALE. Scaling the canvas here resampled
                    a finished frame and cropped it against the well's own
                    overflow. */}
                <PresetCakeViewer config={p.config} shot={galleryShot(p.slug)} />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-baseline justify-between gap-2.5">
                  <h2 className="font-sans text-item font-medium">{p.name}</h2>
                  <span className="shrink-0 font-mono text-meta font-bold tabular-nums">
                    {formatINR(priceCake(p.config).total)}
                  </span>
                </div>
                <p className="flex-1 text-meta leading-normal text-steel">{p.blurb}</p>
                <span className="font-mono text-micro tracking-[0.14em] text-steel uppercase">
                  {servingsLabel(p.config)}
                </span>
                {/*
                  Toppings, which is step 7 of 9.

                  The first half of the old reasoning here holds: a preset is a
                  finished cake, and dropping the customer at step 1 asks them to
                  walk back through nine decisions already made for them, which is
                  the opposite of what a preset is for. Landing on Review was the
                  wrong conclusion from it, though, because the nine steps are not
                  all the same kind of decision.

                  Six of them — shape, size, sponge, filling, frosting, finish —
                  are what the preset *is*, and a preset is entitled to have
                  decided those. The last two are not: what lands on top, and what
                  it says. Nobody's chocolate truffle cake is a preset's idea of
                  whose birthday it is, and six of the eight presets carry no
                  message at all, so landing on Review shipped a cake with nothing
                  written on it and never asked. "The step nav is right there" is
                  not an offer — it is a thing to notice, and a customer reading a
                  finished docket has no reason to think anything is missing.

                  So: skip what the preset decided, open on the first thing it
                  cannot. Forward from here is Toppings, Message, Review, each with
                  its own button, which is the two questions that are actually
                  theirs and then the docket.
                */}
                <LoadConfig
                  config={p.config}
                  to="/build/toppings"
                  label="Make it mine"
                  className="w-full"
                />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
