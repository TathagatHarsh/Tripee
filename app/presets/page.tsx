import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LoadConfig } from "@/components/builder/LoadConfig";
import { PRESETS } from "@/lib/presets";
import { priceCake } from "@/lib/pricing";
import { formatINR } from "@/lib/format";
import { servingsLabel } from "@/lib/servings";
import { btn, eyebrow } from "@/lib/ui";

/**
 * The catalogue.
 *
 * Twenty photographs, one per preset, out of `public/presets` — made by
 * `scripts/shoot-presets` from these same `PRESETS` entries, so the cake in the
 * picture and the cake "Make it mine" loads are the same object read twice. See
 * `app/shoot/[slug]`, which is where the camera, the lights and the backdrop now
 * live and where the reasoning behind them was moved to.
 *
 * The page used to draw them: twenty `PresetCakeViewer`s, twelve of them live at
 * once under an admission policy, each on a turntable, none of them allowed to
 * cast a shadow because twelve shadow-casting canvases on one page is not a
 * thing you ship. The cakes were honest and they looked like diagrams. Offline,
 * one frame can cost a second, so they get shadows, 128 radial segments and 2x
 * pixels — and the page costs twenty images.
 *
 * What that trades away is the turn. A cake on a turntable shows every side; a
 * photograph shows one. The catalogue keeps the property that made the turn
 * safe to lose — one camera for all twenty, so what differs between two cards is
 * the cake and never the crop — and the builder, one click away, still turns.
 */

export const metadata: Metadata = {
  title: "Cakes we already know by heart — Makemycake",
  description:
    "Twelve flavours and eight designs, all of them finished. Open one and change whatever you like.",
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
            Every one of these was photographed from a real configuration, not
            picked off a stock library. Open any of them and it lands in the
            builder exactly as shown — then change whatever you like.
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
                4:5, matching the real portrait food photos (~1122x1402) that
                replaced the 4:3 camera renders — 4:3 was cropping their tops
                and bases off. A fixed ratio rather than a fixed height, so this
                holds at one, two, three and four columns without a
                breakpoint per column.
              */}
              <div className="cake-stage relative aspect-[4/5] overflow-hidden border-b border-rule">
                {/* The push-in used to live in the scene — see
                    three/Turntable.HOVER_SCALE — because scaling a canvas here
                    resampled a finished frame. A bitmap has no such objection,
                    and the well clips, so a plain transform is the whole of it.
                    Motion, so it waits to be asked for. */}
                <Image
                  src={`/presets/${p.slug}.webp`}
                  alt={p.name}
                  fill
                  sizes="(min-width:1280px) 25vw, 50vw"
                  className={
                    "object-cover transition-transform duration-[400ms] ease-[var(--ease-out)] " +
                    "motion-safe:group-hover:scale-[1.02]"
                  }
                />
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
