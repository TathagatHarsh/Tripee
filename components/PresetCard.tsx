import Image from "next/image";
import { LoadConfig } from "@/components/builder/LoadConfig";
import { formatINR } from "@/lib/format";
import type { Preset } from "@/lib/presets";
import { priceCake } from "@/lib/pricing";
import { servingsLabel } from "@/lib/servings";

/**
 * One preset, shot like a page from a catalogue rather than logged like a
 * product.
 *
 * The cake on the card is a photograph — `public/presets/<slug>.webp`, made by
 * `scripts/shoot-presets` — where it used to be a live canvas. It is still a
 * render of this preset's own `CakeConfig`, drawn by the same `CakeScene` the
 * builder draws, so the promise the catalogue makes still holds: the cake in the
 * picture is the cake the CTA hands over. What changed is only what a render can
 * afford. Nothing drawn in twelve simultaneous browser canvases can cast a
 * shadow (see quality.CARD_BUDGET, which switches them off), and the difference
 * between a cake with a shadow under it and one without is most of the
 * difference between a photograph and a diagram.
 *
 * One card, both pages. The landing page and /presets had grown two different
 * ones — the landing's stacking serves, name and blurb over a ruled row with the
 * price beside the button; the catalogue's putting the price up on the title line
 * with the button full width beneath. Two layouts for one object is the kind of
 * thing nobody decides and everybody notices: the same cake changed shape between
 * the page that advertised it and the page that sold it. This is the catalogue's,
 * because a price belongs on the line with the thing it is the price of.
 *
 * `as` because heading level is a property of the page, not of the card: on
 * /presets the h1 is the catalogue's own title, so these are h2; on the landing
 * page they sit under a section h2, so they are h3. Getting that wrong is an axe
 * failure (heading-order), not a stylistic preference.
 */
export function PresetCard({
  preset,
  as: Heading = "h3",
}: {
  preset: Preset;
  as?: "h2" | "h3";
}) {
  return (
    <li
      className={
        "group flex flex-col overflow-hidden border border-rule bg-paper " +
        "transition-[box-shadow,border-color,translate] " +
        /*
         * `var(...)` spelled out, not the `[--dur-ui]` shorthand used elsewhere
         * in this codebase. Tailwind v4 dropped that shorthand, so
         * `duration-[--dur-ui]` compiles to the literal `transition-duration:
         * --dur-ui`, which is invalid and silently resolves to 0s. Checked in the
         * built stylesheet, not assumed.
         */
        "duration-[var(--dur-ui)] ease-[var(--ease-out)] " +
        "hover:border-steel " +
        // The lift is motion, so it waits to be asked for.
        "motion-safe:hover:-translate-y-1"
      }
    >
      {/*
        Square, where this was 4:5.

        The source photographs are 1122×1402 portrait and the cake in them runs
        from about a fifth of the way down to about nine tenths — seven tenths of
        the frame, with a great deal of backdrop above it. Printed at the photo's
        own ratio a landing card came out 761px tall, so three of them filled a
        900px viewport once over. That is not a row of cakes anybody can compare;
        it is three posters.

        A square keeps the middle 80% of the frame, and it is the tightest crop
        that still clears the cake board — 5:4 and 4:3 both cut through it,
        measured off the photographs rather than guessed at. `object-position`
        pushes the window down the frame because the wasted backdrop is all at the
        top: the cake ends up optically centred instead of sitting low under
        headroom that was never part of the composition.

        `cake-stage` under the image is not decoration — it is the same ivory
        sweep the photograph is shot against, so the well matches the picture
        about to land in it instead of flashing a different colour first.
      */}
      <div className="cake-stage relative aspect-square overflow-hidden border-b border-rule">
        <Image
          src={`/presets/${preset.slug}.webp`}
          alt={preset.name}
          fill
          sizes="(min-width:1280px) 23vw, (min-width:1024px) 31vw, (min-width:640px) 47vw, 92vw"
          /* The push-in used to happen inside the scene — see three/Turntable —
             because scaling a canvas resamples a frame that has already been
             drawn. A bitmap has no such objection, and the well clips, so a plain
             transform is the whole of it. Motion, so it waits to be asked for. */
          className={
            "object-cover object-[50%_62%] transition-transform " +
            "duration-[400ms] ease-[var(--ease-out)] motion-safe:group-hover:scale-[1.02]"
          }
        />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-5">
        {/* `min-w-0` on the name and `shrink-0` on the price: a long cake name is
            what has to wrap here, because a price broken over two lines stops
            reading as a number. */}
        <div className="flex items-baseline justify-between gap-3">
          <Heading className="min-w-0 font-sans text-item font-medium tracking-[-0.008em]">
            {preset.name}
          </Heading>
          <span className="shrink-0 font-mono text-meta font-medium tabular-nums">
            {formatINR(priceCake(preset.config).total)}
          </span>
        </div>

        {/* Two lines, clamped. Every blurb in lib/presets already fits in two at
            this width — the longest is 69 characters — so this changes nothing
            today and stops one long line from making a whole row taller later. */}
        <p className="line-clamp-2 flex-1 text-meta leading-normal text-steel">
          {preset.blurb}
        </p>

        <span className="font-mono text-micro tracking-[0.14em] text-steel uppercase">
          {servingsLabel(preset.config)}
        </span>

        {/*
          Toppings, which is step 7 of 9.

          A preset is a finished cake, and dropping the customer at step 1 asks
          them to walk back through nine decisions already made for them, which is
          the opposite of what a preset is for. Landing them on Review was the
          wrong conclusion from that, because the nine steps are not all the same
          kind of decision.

          Six of them — shape, size, sponge, filling, frosting, finish — are what
          the preset *is*, and a preset is entitled to have decided those. The last
          two are not: what lands on top, and what it says. Nobody's chocolate
          truffle cake is a preset's idea of whose birthday it is, and most presets
          carry no message at all, so landing on Review shipped a cake with nothing
          written on it and never asked. "The step nav is right there" is not an
          offer — it is a thing to notice, and a customer reading a finished docket
          has no reason to think anything is missing.

          So: skip what the preset decided, open on the first thing it could not.
        */}
        <LoadConfig
          config={preset.config}
          to="/build/toppings"
          label="Order now"
          className="w-full"
        />
      </div>
    </li>
  );
}
