import type { Metadata } from "next";
import Link from "next/link";
import { PresetCard } from "@/components/PresetCard";
import { PRESETS } from "@/lib/presets";
import { btn, eyebrow, pager } from "@/lib/ui";

/**
 * The catalogue.
 *
 * Twenty photographs, one per preset, out of `public/presets` — made by
 * `scripts/shoot-presets` from these same `PRESETS` entries, so the cake in the
 * picture and the cake "Order now" loads are the same object read twice. See
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

/*
 * Eight, not twenty-one. The grid runs four columns at its widest, so a page is
 * two full rows at every size that has more than one — four, two and one all
 * divide it — and the catalogue goes from four thousand pixels of scroll to
 * about seventeen hundred. Three pages of 8, 8 and 5.
 */
const PER_PAGE = 8;

/**
 * Pages live in the URL rather than in component state, which is the opposite of
 * the landing page's section (see components/PresetPager, which explains its own
 * side of it). Three reasons, and only the first is about the customer: a page of
 * a catalogue is a thing people link to and come back to, so it should survive
 * being bookmarked and the back button. Every card is then in the server-rendered
 * HTML of some URL a crawler can reach — and this page is the *only* place most
 * of these cakes are named anywhere on the site, so client-side paging would take
 * thirteen of the twenty-one out of the index. And it needs no JavaScript at all.
 */
export default async function PresetsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const pages = Math.ceil(PRESETS.length / PER_PAGE);
  /* A page number off a URL is untrusted: "abc" is NaN, "0" and "-3" index
     before the start, "9e9" past the end. Clamped rather than 404'd — a stale
     link to page 4 of a catalogue that has since shrunk should still show a
     catalogue, not an error. */
  const current = Math.min(pages, Math.max(1, Math.trunc(Number(page)) || 1));
  const shown = PRESETS.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  // Page one is `/presets`, so the catalogue has one address and not two.
  const href = (n: number) => (n === 1 ? "/presets" : `/presets?page=${n}`);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="flex h-[78px] items-center justify-between gap-6 border-b border-rule px-4 sm:px-8 lg:px-14">
        <div className="flex min-w-0 items-center gap-3.5">
          <Link href="/" className="font-mono text-meta font-medium tracking-[0.2em]">
            MAKEMYCAKE
          </Link>
          <span aria-hidden className="hidden size-1 bg-rule sm:block" />
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
              Cakes we already <span className="text-steel">know by heart.</span>
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
            "grid auto-rows-fr grid-cols-1 gap-6 border-t border-rule pt-10 " +
            "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          }
        >
          {shown.map((p) => (
            /* h2, because the h1 on this page is the catalogue's own title. On
               the landing page these sit under a section heading and are h3 —
               see the note on `as` in components/PresetCard. */
            <PresetCard key={p.slug} preset={p} as="h2" />
          ))}
        </ul>

        {pages > 1 && (
          <nav
            aria-label="Catalogue pages"
            className="flex flex-wrap items-center justify-center gap-2 pt-12 pb-20"
          >
            {/* A step with nowhere to go is a span, not a link with the href
                left off: an anchor without one is not a control, it is text that
                keyboard users still land on and screen readers still announce as
                a link. `aria-disabled` picks up the same styling the real
                disabled state gets — see OFF in lib/ui. */}
            {current > 1 ? (
              <Link href={href(current - 1)} className={pager()}>← Prev</Link>
            ) : (
              <span aria-disabled="true" className={pager()}>← Prev</span>
            )}

            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={href(n)}
                aria-current={n === current ? "page" : undefined}
                className={pager(n === current)}
              >
                {n}
              </Link>
            ))}

            {current < pages ? (
              <Link href={href(current + 1)} className={pager()}>Next →</Link>
            ) : (
              <span aria-disabled="true" className={pager()}>Next →</span>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
