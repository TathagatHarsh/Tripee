import Link from "next/link";
import { HeroCake } from "@/components/HeroCake";
import { HeroReveal } from "@/components/HeroReveal";
import { PresetCard } from "@/components/PresetCard";
import { PresetPager } from "@/components/PresetPager";
import { Docket } from "@/components/docket/Docket";
import { FSSAI_LICENCE } from "@/lib/docket";
import { FILLINGS, SHAPES, SPONGES, TOPPINGS } from "@/lib/catalog";
import { resolveSlot } from "@/lib/delivery";
import { HERO_CAKE, HERO_CAKE_NAME } from "@/lib/hero";
import { PRESETS } from "@/lib/presets";
import { priceCake } from "@/lib/pricing";
import { formatINR } from "@/lib/format";
import { servingsLabel } from "@/lib/servings";
import { btn, eyebrow } from "@/lib/ui";

const HERO = HERO_CAKE;

/*
 * Lead times come from the same resolver the builder and the docket use, asked
 * with one representative pincode per zone. Typing "24 h" into the marketing
 * page is how a landing page ends up promising something the delivery module
 * disagrees with.
 */
const ZONE_LEAD = [
  { name: "Core", hours: resolveSlot("standard", "500001").effectiveLeadHours },
  { name: "Outer", hours: resolveSlot("standard", "500500").effectiveLeadHours },
];

export default function Home() {
  return (
    <div className="bg-paper">
      <header className="sticky top-0 z-20 flex h-[78px] items-center justify-between gap-6 border-b border-rule bg-paper/95 px-4 backdrop-blur-md sm:px-8 lg:px-14">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="font-mono text-meta font-bold tracking-[0.2em]">MAKEMYCAKE</span>
          <span aria-hidden className="hidden size-1 rounded-full bg-rule sm:block" />
          <span className="hidden font-mono text-micro tracking-[0.1em] text-steel sm:block">
            JUBILEE HILLS
          </span>
        </div>

        <nav aria-label="Sections" className="hidden gap-9 text-body text-graphite lg:flex">
          <a href="#presets" className="transition-colors hover:text-ink">Presets</a>
          <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          <a href="#bakery" className="transition-colors hover:text-ink">The bakery</a>
        </nav>

        <div className="flex shrink-0 items-center gap-2.5">
          {/* The `hidden` has to sit on a wrapper. `btn()` puts `inline-flex` in
              its own base classes, and when two display utilities land in the
              same Tailwind layer the stylesheet order settles it, not the order
              they appear in the attribute — so this button never hid, and on a
              phone it and "Start building" crowded straight over the wordmark.
              `sm:contents` puts the link back in the flex row untouched. */}
          <span className="hidden sm:contents">
            <Link href="/presets" className={btn("secondary", "md")}>
              Explore presets
            </Link>
          </span>
          <Link href="/build/shape" className={btn("primary", "md")}>
            Start building
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        {/*
          `minmax(0, …)` on every track, which is doing real work rather than
          being defensive noise.

          An `fr` and an implicit `auto` track both take `auto` as their minimum,
          and `auto` there means "at least the item's max-content". The metadata
          row at the bottom of the copy is 572px unwrapped, so below lg — where
          this collapses to one implicit column — the track sized itself to that
          and came out 580px wide inside a 343px phone. Every child then laid out
          against 580px and ran off the side of the screen: clipped headline,
          clipped paragraph, a CTA half off the edge. Flooring the minimum at 0
          lets the track be the width it actually has and the text wrap.
        */}
        <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 bg-[linear-gradient(180deg,#FDFCFA_0%,#F2EEE6_62%,#EBE7DD_100%)] px-4 pt-12 pb-16 sm:px-8 lg:min-h-[724px] lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-0 lg:px-0 lg:py-0 lg:pl-14">
          <HeroReveal className="flex max-w-[41.25rem] flex-col justify-center gap-7 lg:gap-8">
            <span className={`${eyebrow} tracking-[0.24em]`}>
              Single bakery · Jubilee Hills · Hyderabad
            </span>

            <h1 className="text-hero">
              Custom cake.
              <br />
              <span className="text-graphite italic">Designed by you.</span>
            </h1>

            <p className="max-w-[46ch] text-lede leading-relaxed text-steel">
              Nine choices, one cake, rendered in front of you as you make them. The
              price is itemised from the first tap — and nobody takes your money
              until we have spoken.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/build/shape" className={btn("primary", "lg")}>
                Start building <span aria-hidden className="font-mono text-meta">→</span>
              </Link>
              <Link href="/presets" className={btn("secondary", "lg")}>
                Explore presets
              </Link>
            </div>

            <ul className="flex flex-wrap items-center gap-4 pt-1 font-mono text-micro tracking-[0.13em] text-steel uppercase">
              <li>Live price from step one</li>
              <li aria-hidden className="size-[3px] rounded-full bg-rule" />
              <li>No payment now</li>
              <li aria-hidden className="size-[3px] rounded-full bg-rule" />
              <li>{ZONE_LEAD[0].hours}-hour lead time</li>
            </ul>
          </HeroReveal>

          {/*
            The one place on this page with a live WebGL context. Everything the
            layout owns — the pool of light, the status pill, the spec block — is
            outside the canvas, so the renderer's own framing is untouched.
          */}
          {/* No `min-h` of its own: the stage inside already reserves its height
              for the lazily-loaded canvas, and a 24rem floor round a 20rem stage
              was 64px of dead page between the copy and the cake on a phone. */}
          {/* `flex-col`, so the badge can sit under the stage on a phone rather
              than beside it. On desktop the badge and the spec block are both
              absolute, which leaves the stage as the only item in flow and makes
              the direction moot. */}
          <div className="relative flex flex-col items-center justify-center lg:h-full">
            {/* The pool of light behind the cake. `max-w-full`, not 130%: a
                centred box wider than its column overhangs both sides of it, and
                on a phone that put 38px of the glow past the viewport and gave
                the whole page a horizontal scrollbar. At 40rem it is narrower
                than the column on every breakpoint that has room for it, so the
                cap only ever binds where it has to. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 size-[40rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(50%_50%_at_50%_40%,rgba(250,245,234,.95),rgba(250,245,234,0)_72%)]"
            />
            <HeroCake config={HERO} />

            <div className="pointer-events-none absolute top-4 right-4 hidden text-right font-mono text-micro leading-loose tracking-[0.1em] text-steel lg:top-24 lg:right-14 lg:block">
              <div className="text-graphite uppercase">{HERO_CAKE_NAME}</div>
              <div className="uppercase">{servingsLabel(HERO)}</div>
              <div className="font-bold text-ink">{formatINR(priceCake(HERO).total)}</div>
            </div>
          </div>
        </section>

        {/* ── The catalogue, in four numbers ────────────────────────────── */}
        <dl className="grid grid-cols-2 border-y border-slab-deep bg-slab lg:grid-cols-4">
          {[
            ["Shapes", SHAPES.length],
            ["Sponges", SPONGES.length],
            ["Fillings", FILLINGS.length],
            ["Toppings", TOPPINGS.length],
          ].map(([label, n], i) => (
            <div
              key={label}
              className={[
                "px-6 py-7 sm:px-10",
                i < 3 ? "lg:border-r lg:border-slab-deep" : "",
                i % 2 === 0 ? "border-r border-slab-deep lg:border-r" : "",
                i < 2 ? "border-b border-slab-deep lg:border-b-0" : "",
              ].join(" ")}
            >
              <dd className="font-display text-[2.375rem] leading-none">{n}</dd>
              <dt className="mt-2 font-mono text-micro tracking-[0.16em] text-steel uppercase">
                {label}
              </dt>
            </div>
          ))}
        </dl>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="how" className="scroll-mt-24 bg-paper px-4 py-20 sm:px-8 lg:px-14 lg:py-24">
          <div className="mb-12 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
            <h2 className="text-heading">How it works</h2>
            <p className="max-w-[40ch] text-body leading-relaxed text-steel">
              Nine steps, grouped into four decisions. Most people finish in under
              six minutes.
            </p>
          </div>

          <ol className="grid gap-px border-y border-slab-deep bg-slab-deep lg:grid-cols-3">
            {[
              [
                "Design it in 3D",
                "Shape, size, sponge, filling, frosting, finish, toppings, message. The cake redraws on every tap — and cuts open when you want to see the layers.",
              ],
              [
                "Watch the price",
                "Every option shows what it adds before you choose it. The docket beside the cake keeps a running, itemised total with GST — never a mystery number at checkout.",
              ],
              [
                "Order without paying",
                "Name and phone number, nothing more. We call to confirm the details, then bake. You keep the reference and the docket.",
              ],
            ].map(([title, body], i) => (
              <li key={title} className="flex flex-col gap-4 bg-paper px-8 py-10 lg:px-10">
                <span className="font-display text-[2.125rem] leading-none text-brass">
                  0{i + 1}
                </span>
                <h3 className="font-sans text-[1.375rem] font-medium tracking-[-0.01em]">
                  {title}
                </h3>
                <p className="text-body leading-relaxed text-steel">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Presets ──────────────────────────────────────────────────── */}
        <section id="presets" className="scroll-mt-24 bg-paper px-4 pb-20 sm:px-8 lg:px-14 lg:pb-24">
          <div className="mb-8 flex items-end justify-between gap-6">
            <h2 className="text-heading">Start from one of ours</h2>
            <Link
              href="/presets"
              className="shrink-0 font-mono text-micro tracking-[0.14em] text-brass uppercase underline-offset-4 hover:underline"
            >
              Browse the catalogue →
            </Link>
          </div>

          {/*
            All of them, six at a time. This printed three hand-picked slugs and
            linked out for the rest, which was right while the three were art
            directed one by one — a marketing row where each cake had its own
            camera. That went when the cards became photographs from a single
            shoot (see components/PresetCard), and once every card is the same
            kind of object there is no argument left for showing a customer three
            of twenty-one and asking them to click through for the others.

            Eight, on the same four-column grid the catalogue uses — two full
            rows at every width that has more than one column, and the same page
            of cakes in both places, which is one less thing for a customer to
            re-read. Each card carries its own shot — see components/PresetCard.
          */}
          <PresetPager
            perPage={8}
            className={
              "grid auto-rows-fr grid-cols-1 gap-6 " +
              "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            }
          >
            {PRESETS.map((p) => (
              <PresetCard key={p.slug} preset={p} />
            ))}
          </PresetPager>
        </section>

        {/* ── The docket ───────────────────────────────────────────────── */}
        <section className="grid border-t border-slab-deep bg-slab lg:grid-cols-2">
          <div className="flex flex-col justify-center gap-6 px-4 py-20 sm:px-8 lg:px-14 lg:py-24">
            <span className={`${eyebrow} tracking-[0.22em]`}>The docket</span>
            <h2 className="max-w-[14ch] text-heading">Every rupee has a name on it.</h2>
            <p className="max-w-[48ch] text-lede leading-relaxed text-steel">
              This is the ticket our kitchen actually works from. It is built from
              the same object the 3D cake is drawn from, so it cannot drift from
              what you designed. You see it from step one, you can download it, and
              the price on it is the price we call to confirm.
            </p>
            <ol className="flex flex-col gap-3 text-body text-graphite">
              {[
                "Itemised lines, never a collapsed total",
                "Allergens derived from what you chose, not typed by hand",
                "Servings, shelf life and lead time for your pincode",
              ].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden className="pt-[3px] font-mono text-micro text-brass">
                    0{i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </div>

          {/*
            The real component, with the real hero config — not a picture of one.
            A screenshot of the docket on the page that promises the docket is
            exactly the drift this section claims cannot happen.
          */}
          <div className="flex items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#E4E0D6,#D8D3C7)] px-4 py-16 sm:px-8">
            <div className="w-[21.25rem] max-w-full rotate-[-1.6deg] shadow-elev-3">
              <Docket config={HERO} className="max-h-[32rem] rounded-ticket border border-rule" />
            </div>
          </div>
        </section>

        {/* ── The bakery ───────────────────────────────────────────────── */}
        <section
          id="bakery"
          className="scroll-mt-24 border-t border-slab-deep bg-paper px-4 py-20 sm:px-8 lg:px-14"
        >
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-3.5">
              <h2 className="text-[2rem]">
                One kitchen. <span className="italic">One city.</span>
              </h2>
              <p className="max-w-[34ch] text-body leading-relaxed text-steel">
                We bake to order in Jubilee Hills and deliver across Hyderabad.
                Nothing is made ahead, nothing is frozen.
              </p>
            </div>

            <InfoBlock label="Address">
              Road No. 36
              <br />
              Jubilee Hills
              <br />
              Hyderabad 500033
            </InfoBlock>
            <InfoBlock label="Hours">
              Tue–Sun
              <br />
              9:00 – 20:00
              <br />
              Closed Mondays
            </InfoBlock>
            <InfoBlock label="Delivery">
              {ZONE_LEAD.map(z => (
                <span key={z.name} className="block">
                  {z.name} · {z.hours} h
                </span>
              ))}
              <span className="block">Extended · standard only</span>
            </InfoBlock>
          </div>
        </section>

        {/* ── The one thing to do ──────────────────────────────────────── */}
        <section className="flex flex-col items-center gap-8 bg-ink px-4 py-24 text-center sm:px-8 lg:py-28">
          <h2 className="max-w-[16ch] text-display text-paper">
            Nine choices away from the cake you pictured.
          </h2>
          <Link
            href="/build/shape"
            className="inline-flex min-h-14 items-center gap-3 rounded-card bg-paper px-8 text-item font-medium text-ink transition-colors duration-[--dur-ui] hover:bg-counter"
          >
            Start building <span aria-hidden className="font-mono text-meta">→</span>
          </Link>
          <p className="font-mono text-micro tracking-[0.14em] text-quiet uppercase">
            No payment now · We call to confirm
          </p>
        </section>
      </main>

      <footer className="border-t border-graphite bg-ink px-4 py-7 sm:px-8 lg:px-14">
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-micro tracking-[0.13em] text-quiet uppercase">
          <span>Makemycake · Jubilee Hills</span>
          {FSSAI_LICENCE
            ? <span>FSSAI Lic. No. {FSSAI_LICENCE}</span>
            : <span>FSSAI licence — shown when configured</span>}
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className={`${eyebrow} tracking-[0.16em]`}>{label}</span>
      <p className="text-body leading-loose text-graphite">{children}</p>
    </div>
  );
}
