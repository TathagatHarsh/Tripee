import { readFileSync } from "node:fs";
import { join } from "node:path";

import Link from "next/link";

import { deriveAllergens } from "@/lib/allergens";
import { FILLINGS, FROSTINGS, SHAPES, SPONGES, STEPS, TOPPINGS } from "@/lib/catalog";
import { SLOTS } from "@/lib/delivery";
import { FSSAI_LICENCE, renderSpecSheet } from "@/lib/docket";
import { PRESETS } from "@/lib/presets";
import { mulberry32 } from "@/lib/seed";

import {
  DELIVERY_TABLE, FILM_CAKE, HOUSE_RULES, NINE_STEPS, SIZE_TABLE, TICKET_LINES,
  TICKET_NO, ZONE_TABLE,
} from "./cake";
import { Film } from "./Film";
import { Intake } from "./Intake";
import { Masthead, Stamp } from "./Letterhead";
import { TwoCopies } from "./TwoCopies";
import "./film.css";

/* Seeded once, consumed in order, so every stub sits at the same angle on the
   server and in the browser. */
const rng = mulberry32(36);
const STUB_ANGLES = PRESETS.map(() => (rng() * 3 - 1.5).toFixed(2));

const NUMBERS: [string, string][] = [
  [String(SHAPES.length), "shapes"],
  [String(SPONGES.length), "sponges"],
  [String(FILLINGS.length), "fillings"],
  [String(FROSTINGS.length), "frostings"],
  [String(TOPPINGS.length), "toppings"],
  [String(PRESETS.length), "we have made before"],
  [String(STEPS.length), "choices"],
  [String(SLOTS.standard.leadHours), "hours"],
];

const KITCHEN_DAY: [string, string][] = [
  ["05:30", "Sponges go in. Nothing is filled while it is warm — the filling would slide and the layers would slip by evening."],
  ["11:00", "Cooled, levelled, filled. This is the hour the 48 exists for."],
  ["16:00", "Coated, combed, dripped, garnished. Toppings go on last because they are the only part that cannot wait."],
];

/**
 * The first frame, inlined into the HTML rather than fetched.
 *
 * It is the LCP element on this page, so waiting a round trip on the manifest
 * to discover its URL and a second one to fetch it would make the largest thing
 * on screen the last thing to arrive. Read once, at request time; absent before
 * the track is built, which is the case the specimen window is designed for.
 */
function readPoster(): string | undefined {
  try {
    return readFileSync(join(process.cwd(), "public", "film", "poster.txt"), "utf8").trim();
  } catch {
    return undefined;
  }
}

export function FilmHome() {
  const allergens = deriveAllergens(FILM_CAKE);
  const poster = readPoster();

  return (
    <div className="film bg-paper text-ink">
      <Masthead />

      <Film ticketNo={TICKET_NO} lines={TICKET_LINES} poster={poster} />

      {/* (1) */}
      <Intake />

      {/* (2) */}
      <TwoCopies lines={TICKET_LINES} ticketNo={TICKET_NO} />

      {/* (3) ─────────────────────────────────────────────────────────────── */}
      <Section title="Nine choices. One cake.">
        <p className="text-[length:var(--prose-base)] text-ink-60">
          No step counter and no progress bar. You can see all nine at once,
          which is the only honest way to show somebody how long a thing takes.
        </p>
        <div className="mt-[48px] max-w-[900px]">
          {NINE_STEPS.map(s => (
            <div key={s.label} className="film-ticket-line" data-printed="true">
              <span className="film-label">{s.label}</span>
              <span className="film-leader" aria-hidden />
              <span className="film-value normal-case">{s.hint}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* (4) ─────────────────────────────────────────────────────────────── */}
      <Section title="The price is on the ticket from the first tap">
        <p className="text-[length:var(--prose-base)] text-ink-60">
          This is the docket for the cake in the film, printed the way the
          kitchen prints it. Every line on it is a decision somebody made.
        </p>

        <div className="mt-[48px] grid gap-[48px] lg:grid-cols-12 lg:gap-[96px]">
          <div className="min-w-0 lg:col-span-7">
            {/* The one shadow on this page: a sheet lying on the desk. */}
            <pre className="film-docket paper-edge bg-paper p-[32px]">
              {renderSpecSheet(FILM_CAKE)}
            </pre>
            <p className="mt-[16px] text-[length:var(--prose-sm)] text-ink-60">
              {allergens.eggless ? "Eggless is what we bake by default" : "Contains egg"} —{" "}
              {allergens.allergens.join(", ").toLowerCase()} are derived from the recipe above,
              never typed onto it.
            </p>
          </div>

          <div className="lg:col-span-5">
            <h3 className="text-[length:var(--mono-lg)] tracking-[var(--tracking-mono-lg)]">
              Six sizes
            </h3>
            <div className="mt-[24px]">
              {SIZE_TABLE.map(s => (
                <div key={s.label} className="film-ticket-line" data-printed="true">
                  <span className="film-label">
                    {s.label} · {s.diameter}
                  </span>
                  <span className="film-leader" aria-hidden />
                  <span className="film-value">
                    Serves {s.serves} · {s.total}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-[16px] text-[length:var(--prose-sm)] text-ink-60">
              Servings are the weight divided by a hundred grams. A generous
              slice is nearer a hundred and twenty-five, which is where the
              lower number comes from.
            </p>
          </div>
        </div>
      </Section>

      {/* (5) ─────────────────────────────────────────────────────────────── */}
      <section className="film border-t border-ink-15 bg-paper-2">
        <div className="mx-auto max-w-[1400px] px-[24px] py-[96px] md:px-[48px]">
          <h2 className="text-[length:var(--mono-xl)] leading-[var(--leading-mono-xl)] tracking-[var(--tracking-mono-xl)]">
            We bake it the day it goes out
          </h2>
          <p className="mt-[16px] text-[length:var(--prose-base)] text-ink-60">
            One kitchen, one city. Nothing is made ahead and nothing is frozen,
            so a cake that leaves on Saturday was batter on Saturday.
          </p>

          <div className="mt-[48px] grid gap-[32px] sm:grid-cols-3">
            {KITCHEN_DAY.map(([time, line], i) => (
              <div key={time}>
                <div
                  className="film-crop mb-[16px] h-[160px]"
                  style={{ backgroundImage: `url(/film/crop-${i + 1}.webp)` }}
                />
                <div className="text-[1.25rem] leading-[var(--leading-mono-lg)] tracking-[var(--tracking-mono-lg)]">
                  {time}
                </div>
                <p className="mt-[8px] text-[length:var(--prose-sm)] text-ink-60">{line}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-[96px] text-[length:var(--mono-lg)] tracking-[var(--tracking-mono-lg)]">
            Five ways it reaches you
          </h3>
          <div className="mt-[24px]">
            {DELIVERY_TABLE.map(d => (
              <div key={d.label} className="border-b border-ink-15 py-[12px]">
                <div className="film-ticket-line" data-printed="true">
                  <span className="film-label">{d.label}</span>
                  <span className="film-leader" aria-hidden />
                  <span className="film-value">
                    {d.window} · {d.fee}
                  </span>
                </div>
                <p className="pl-[12px] text-[length:var(--prose-sm)] text-ink-60">{d.note}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-[64px] text-[length:var(--mono-lg)] tracking-[var(--tracking-mono-lg)]">
            Three zones
          </h3>
          <div className="mt-[24px]">
            {ZONE_TABLE.map(z => (
              <div key={z.range} className="border-b border-ink-15 py-[12px]">
                <div className="film-ticket-line" data-printed="true">
                  <span className="film-label">
                    {z.name} · {z.range}
                  </span>
                  <span className="film-leader" aria-hidden />
                  <span className="film-value">Standard {z.lead}</span>
                </div>
                <p className="pl-[12px] text-[length:var(--prose-sm)] text-ink-60">{z.slots}</p>
              </div>
            ))}
          </div>
          <p className="mt-[16px] text-[length:var(--prose-sm)] text-ink-60">
            Express only exists inside 500001–500099. Past that the rider cannot
            make the window, so we do not offer it rather than miss it.
          </p>
        </div>
      </section>

      {/* (6) ─────────────────────────────────────────────────────────────── */}
      <section className="film border-t border-ink-15">
        <div className="mx-auto flex max-w-[1400px] flex-wrap gap-x-[48px] gap-y-[32px] px-[24px] py-[64px] md:px-[48px]">
          {NUMBERS.map(([n, label]) => (
            <div key={label}>
              <div className="text-[length:var(--mono-xl)] leading-[var(--leading-mono-xl)] tracking-[var(--tracking-mono-xl)]">
                {n}
              </div>
              <div className="text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* (7) ─────────────────────────────────────────────────────────────── */}
      <Section title={`${PRESETS.length} we've made before`}>
        <p className="text-[length:var(--prose-base)] text-ink-60">
          Each one is a specification you can read, with the photograph
          underneath confirming it. Open any of them and the builder loads that
          exact cake.
        </p>

        <div className="film-rail mt-[48px]">
          {PRESETS.map((p, i) => (
            <Link
              key={p.slug}
              href={`/build?preset=${p.slug}`}
              className="paper-edge block w-[280px] bg-paper p-[16px]"
              style={{ transform: `rotate(${STUB_ANGLES[i]}deg)` }}
            >
              <div className="text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] uppercase">
                {p.name}
              </div>
              <div className="mt-[8px] h-px w-full bg-ink-15" />
              <dl className="mt-[8px] text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
                {[
                  ["Sponge", p.config.sponge],
                  ["Fill", p.config.filling],
                  ["Frost", p.config.frosting],
                  ["Size", p.config.size],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline">
                    <dt>{k}</dt>
                    <span className="film-leader" aria-hidden />
                    <dd className="text-ink">{String(v).replace(/-/g, " ")}</dd>
                  </div>
                ))}
              </dl>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/presets/${p.slug}.webp`}
                alt={p.name}
                loading="lazy"
                className="mt-[12px] block h-[180px] w-full object-cover"
              />
              <p className="mt-[8px] text-[length:var(--prose-sm)] text-ink-60">{p.blurb}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* (8) ─────────────────────────────────────────────────────────────── */}
      <Section title="What we don't do">
        <p className="text-[length:var(--prose-base)] text-ink-60">
          Every one of these is enforced while you build, not discovered on the
          phone afterwards.
        </p>
        <div className="mt-[48px] max-w-[900px]">
          {HOUSE_RULES.map(r => (
            <p
              key={r.id}
              className="border-b border-ink-15 py-[16px] font-mono text-[1.25rem] leading-[1.4] tracking-[var(--tracking-mono-lg)] text-ink normal-case"
              style={{ maxWidth: "none" }}
            >
              {r.message}
            </p>
          ))}
        </div>
      </Section>

      {/* CLOSING ─────────────────────────────────────────────────────────── */}
      <section className="film border-t border-ink-15">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-[32px] px-[24px] py-[96px] md:flex-row md:items-center md:justify-between md:px-[48px]">
          <div>
            <h2 className="text-[length:var(--mono-xl)] leading-[var(--leading-mono-xl)] tracking-[var(--tracking-mono-xl)]">
              Nine choices away from the cake you pictured.
            </h2>
            <div className="mt-[32px] flex flex-wrap items-center gap-[24px]">
              <Link href="/build" className="film-button">
                Start the ticket
              </Link>
              <span className="text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
                No payment now · We call to confirm.
              </span>
            </div>
          </div>
          <Stamp />
        </div>
      </section>

      {/* FOOTER — the only dark surface in the brand, which is what makes it
          feel like a closing rather than another band. */}
      <footer className="bg-ink text-paper">
        <div className="mx-auto grid max-w-[1400px] gap-[32px] px-[24px] py-[64px] sm:grid-cols-3 md:px-[48px]">
          <div className="text-[length:var(--mono-xs)] leading-[1.6] tracking-[var(--tracking-mono-xs)] uppercase">
            <div>Makemycake</div>
            <div>Road No. 36, Jubilee Hills</div>
            <div>Hyderabad 500033</div>
          </div>
          <div className="text-[length:var(--mono-xs)] leading-[1.6] tracking-[var(--tracking-mono-xs)] uppercase">
            <div>Counter {SLOTS.pickup.window.replace("Collect ", "")}</div>
            <div>Standard lead {SLOTS.standard.leadHours} hours</div>
            <div>One kitchen · One city</div>
            {/* A licence number is a regulatory identifier, so it is printed when
                the environment carries the real one and the line is simply absent
                otherwise. An invented one would be a fabricated record. */}
            {FSSAI_LICENCE && <div className="mt-[16px]">FSSAI Lic. No. {FSSAI_LICENCE}</div>}
          </div>
          <div className="text-[length:var(--mono-xs)] leading-[1.6] tracking-[var(--tracking-mono-xs)] uppercase">
            <p className="max-w-none font-mono text-[length:var(--mono-xs)] leading-[1.6] tracking-[var(--tracking-mono-xs)] text-paper-3 uppercase">
              The film is generated. The {PRESETS.length} cakes above are photographs of cakes we
              have baked. The prices, the kitchen and the lead times are real.
            </p>
            <div className="mt-[16px]">No tracking cookies. Nothing to accept.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="film border-t border-ink-15">
      <div className="mx-auto max-w-[1400px] px-[24px] py-[96px] md:px-[48px]">
        <h2 className="text-[length:var(--mono-xl)] leading-[var(--leading-mono-xl)] tracking-[var(--tracking-mono-xl)]">
          {title}
        </h2>
        <div className="mt-[16px]">{children}</div>
      </div>
    </section>
  );
}
