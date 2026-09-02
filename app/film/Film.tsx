"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useReducedMotion } from "@/lib/useReducedMotion";
import { CHAPTER_TOTALS, type TicketLine } from "./cake";
import { CALLOUTS, CHAPTERS, FALLBACK_STARTS } from "./chapters";

/* ══════════════════════════════════════════════════════════════════════════
   THE FRAME TRACK
   ══════════════════════════════════════════════════════════════════════════ */

interface Manifest {
  count: number;
  pattern: string;
  poster?: string;
  chapters?: { id: string; start: number }[];
}

/** A decoded frame is either an ImageBitmap (fast path) or an <img> fallback. */
type Frame =
  | { kind: "bitmap"; img: ImageBitmap }
  | { kind: "element"; img: HTMLImageElement; url: string };

/**
 * createImageBitmap is the fast, off-main-thread path — but it throws "the
 * source image could not be decoded" in hidden or backgrounded tabs and in some
 * embedded webviews, which leaves the specimen blank on a page that otherwise
 * loaded perfectly. The fallback below looks like dead code and is the only
 * reason the canvas renders at all in those cases. Do not remove it.
 */
async function decodeBlob(blob: Blob): Promise<Frame> {
  try {
    return { kind: "bitmap", img: await createImageBitmap(blob) };
  } catch {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("img decode failed"));
      img.src = url;
    });
    return { kind: "element", img, url };
  }
}

function releaseFrame(f: Frame) {
  if (f.kind === "bitmap") f.img.close();
  else URL.revokeObjectURL(f.url);
}

const frameUrl = (pattern: string, i: number) =>
  pattern.replace(/%0(\d)d/, (_, w: string) => String(i + 1).padStart(Number(w), "0"));

/**
 * How many decoded frames may exist at once, and how far ahead to decode.
 *
 * These two numbers are the knob that decides whether the page survives a
 * mid-range Android, and they are easy to raise without noticing the cost. A
 * desktop frame decodes to 1400 × 1050 RGBA — 5.9 MB — so the previous 16/32
 * (which evicted only past 64 resident) held roughly 380 MB of pixels and got
 * the tab killed partway through the pin. A WebP this size decodes in about two
 * milliseconds, so four frames of lookahead already covers a fast scrub and the
 * extra twelve bought nothing anyone could perceive.
 *
 * ponytail: fixed window, ~16 frames resident. If a slower device ever shows
 * tearing on a fast drag, raise AHEAD before KEEP.
 */
const AHEAD = 4;
const KEEP = 8;

/** Frames in flight while the tail streams, so it cannot crowd out the page. */
const POOL = 6;

function useFilmTrack(still: boolean) {
  const blobs = useRef<(Blob | null)[]>([]);
  const frames = useRef(new Map<number, Frame>());
  const decoding = useRef(new Set<number>());
  const count = useRef(0);
  const stream = useRef<(() => void) | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    let alive = true;
    const abort = new AbortController();
    const track = window.innerWidth < 768 ? "mobile" : "desktop";

    (async () => {
      let m: Manifest;
      try {
        const res = await fetch(`/film/${track}/manifest.json`, { signal: abort.signal });
        if (!res.ok) return;
        m = await res.json();
      } catch {
        /* No track built yet. The poster and the ticket carry the page. */
        return;
      }
      if (!alive || !m?.count) return;

      /*
       * Somebody who asked for less motion, or who is on a metered or 2G
       * connection, is shown seven stills — about 200 KB of <img>. Fetching the
       * whole 11 MB track to render those was the entire cost of the page
       * charged to the people least able to pay it.
       */
      if (still) {
        setManifest(m);
        return;
      }

      count.current = m.count;
      blobs.current = new Array(m.count).fill(null);

      const fetchFrame = async (i: number, low = false) => {
        try {
          const r = await fetch(frameUrl(m.pattern, i), {
            signal: abort.signal,
            ...(low ? { priority: "low" as RequestPriority } : {}),
          });
          if (r.ok && alive) blobs.current[i] = await r.blob();
        } catch {
          /* one missing frame draws its nearest decoded neighbour */
        }
      };

      // Gate on the first 15% so the film is draggable almost at once.
      const gate = Math.max(1, Math.ceil(m.count * 0.15));
      await Promise.all(Array.from({ length: gate }, (_, i) => fetchFrame(i)));
      if (!alive) return;
      setManifest(m);

      /*
       * The tail used to fire every remaining request in one synchronous loop
       * the instant the manifest landed — hundreds of parallel fetches, at
       * default priority, whether or not the reader ever scrolled. They crowded
       * out the twenty-one preset photographs, which are the only proof this
       * bakery has ever baked anything. Now it drains six at a time, at low
       * priority, and only once the reader has actually entered chapter two.
       */
      let cursor = gate;
      let active = 0;
      const drain = () => {
        while (active < POOL && cursor < m.count && alive) {
          const i = cursor++;
          active++;
          void fetchFrame(i, true).finally(() => {
            active--;
            drain();
          });
        }
      };
      stream.current = drain;
    })();

    const held = frames.current;
    return () => {
      alive = false;
      abort.abort();
      stream.current = null;
      held.forEach(releaseFrame);
      held.clear();
    };
  }, [still]);

  /** Called once the reader commits, so the tail never loads speculatively. */
  const startStream = useCallback(() => {
    const go = stream.current;
    if (go) {
      stream.current = null;
      go();
    }
  }, []);

  /**
   * Stable for the life of the component, and that stability is load-bearing.
   *
   * draw() is a dependency of the ScrollTrigger effect. Redefined on every
   * render — which is every scroll tick, because the ticket lines are state —
   * it made the effect tear the ScrollTrigger down and rebuild it mid-scrub, so
   * the whole schedule ran about a chapter behind the scroll. It closes over
   * refs only, so an empty dep list is correct.
   */
  const draw = useCallback((canvas: HTMLCanvasElement | null, progress: number) => {
    const decode = (i: number) => {
      if (frames.current.has(i) || decoding.current.has(i) || !blobs.current[i]) return;
      decoding.current.add(i);
      decodeBlob(blobs.current[i]!)
        .then(f => frames.current.set(i, f))
        .catch(() => {})
        .finally(() => decoding.current.delete(i));
    };

    const nearest = (i: number): Frame | null => {
      if (frames.current.has(i)) return frames.current.get(i)!;
      for (let d = 1; d < count.current; d++) {
        if (frames.current.has(i - d)) return frames.current.get(i - d)!;
        if (frames.current.has(i + d)) return frames.current.get(i + d)!;
      }
      return null;
    };

    if (!canvas || !count.current) return;
    const i = Math.round(Math.min(1, Math.max(0, progress)) * (count.current - 1));

    for (let d = 0; d <= AHEAD; d++) {
      if (i + d < count.current) decode(i + d);
      if (i - d >= 0) decode(i - d);
    }
    if (frames.current.size > KEEP * 2) {
      for (const [idx, f] of frames.current) {
        if (Math.abs(idx - i) > KEEP) {
          releaseFrame(f);
          frames.current.delete(idx);
        }
      }
    }

    const frame = nearest(i);
    if (!frame) return;
    const src = frame.img;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* Flat paper letterbox, contain-fit, never cover-crop. The frames were
       re-cut to 4:3 at source so the cake fills the window; cropping here
       instead would be the banned move. */
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--letterbox").trim();
    ctx.fillRect(0, 0, cw, ch);

    const s = Math.min(cw / src.width, ch / src.height);
    const w = src.width * s;
    const h = src.height * s;
    ctx.drawImage(src, (cw - w) / 2, (ch - h) / 2, w, h);
  }, []);

  return { manifest, draw, startStream };
}

/* ══════════════════════════════════════════════════════════════════════════
   PRINT SCHEDULE
   ══════════════════════════════════════════════════════════════════════════ */

interface Schedule {
  points: Record<string, number>;
  appendAt: number;
  starts: number[];
}

/**
 * Scroll is divided EQUALLY between the seven chapters, whatever each costs in
 * film time. The two still chapters are under a second and the five clips are
 * ten seconds each, so mapping scroll onto film time gave the bare stack 4% of
 * the page — three ticket lines and three carbon callouts inside 250px of thumb.
 * Chapters are decisions here, not durations.
 */
const SCROLL_STARTS = CHAPTERS.map((_, i) => i / CHAPTERS.length);

function makeToFilm(manifest: Manifest | null) {
  const filmStarts = CHAPTERS.map((ch, i) => {
    const m = manifest?.chapters?.find(c => c.id === ch.id);
    return m ? m.start : FALLBACK_STARTS[i];
  });
  const n = CHAPTERS.length;
  return (p: number) => {
    const clamped = Math.min(0.999999, Math.max(0, p));
    const i = Math.floor(clamped * n);
    const within = clamped * n - i;
    const a = filmStarts[i];
    const b = i + 1 < n ? filmStarts[i + 1] : 1;
    return a + (b - a) * within;
  };
}

function buildSchedule(): Schedule {
  const starts = SCROLL_STARTS;
  const end = (i: number) => (i + 1 < starts.length ? starts[i + 1] : 1);
  const points: Record<string, number> = {};
  let appendAt = 1;

  CHAPTERS.forEach((ch, i) => {
    const span = end(i) - starts[i];
    const at = (f: number) => starts[i] + span * f;
    const n = ch.prints.length;
    ch.prints.forEach((slug, k) => {
      points[slug] = at(n > 1 ? 0.6 + (0.2 * k) / (n - 1) : 0.7);
    });
    if (ch.appends) appendAt = at(0.7);
  });

  return { points, appendAt, starts };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE TICKET
   ══════════════════════════════════════════════════════════════════════════ */

function Ticket({
  ticketNo,
  lines,
  printed,
  active,
  appended,
  caption,
  total,
  finished,
}: {
  ticketNo: string;
  lines: TicketLine[];
  printed: Set<string>;
  active: string | null;
  appended: boolean;
  caption: string | null;
  total: string;
  /** Line nine has printed, so the sheet can close. */
  finished: boolean;
}) {
  const started = printed.size > 0;

  return (
    <div>
      {/* Perforation, use 1 of 2 on this page: the top edge of the ticket. */}
      <div className="film-perf-top" aria-hidden />

      <div className="pt-[16px]">
        <div className="flex items-baseline justify-between text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
          <span>Makemycake · Jubilee Hills</span>
          <span>Ticket No. {ticketNo}</span>
        </div>
        <div className="mt-[8px] h-px w-full bg-ink" />

        {/* Visible at scroll 0, before a single decision exists. It is struck
            when the first line prints and then Feeds off the sheet, because a
            permanent struck line is the one piece of state that never resolves. */}
        {!started && (
          <div className="mt-[12px] text-[length:var(--mono-sm)] tracking-[var(--tracking-mono-sm)] uppercase">
            Nothing on it yet. <span className="film-caret" aria-hidden />
          </div>
        )}

        <div className={started ? "mt-[16px]" : "mt-[24px]"}>
          {lines.map(l => (
            <div
              key={l.slug}
              className="film-ticket-line"
              data-printed={printed.has(l.slug)}
              data-active={active === l.slug}
            >
              <span className="film-print film-label">{l.label}</span>
              <span className="film-leader" aria-hidden />
              <span className="film-print film-value">
                {l.value}
                {l.appended && appended ? l.appended : ""}
              </span>
              {/* The set it was chosen from. Without it every line reads as a
                  fact about somebody else's cake rather than a decision. */}
              {l.choices && (
                <span className="film-choices" aria-label={`one of ${l.choices}`}>
                  1/{l.choices}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* THE FOOT. The band below this film is titled "the price is on the
            ticket from the first tap", so the ticket carries a running total
            from chapter one rather than a single figure at the end. It prints in
            whole steps when it changes; a tweened count-up is not one of the
            seven motions. */}
        {started && (
          <div className="mt-[16px]">
            <div className="h-px w-full bg-ink-15" />
            <div className="mt-[3px] h-px w-full bg-ink" />
            <div className="flex items-baseline justify-between py-[12px] text-[length:var(--mono-lg)] leading-[var(--leading-mono-lg)] tracking-[var(--tracking-mono-lg)] uppercase">
              <span className="text-ink-60">{finished ? "Total" : "So far"}</span>
              <span key={total} className="film-print-now">{total}</span>
            </div>
            <div className="h-px w-full bg-ink" />
          </div>
        )}

        {/* The ask, at the peak. The ticket is already the navigation, so the
            call to action is a line on it — not a bar, not a card. */}
        {finished && (
          <div className="film-ticket-line mt-[12px]" data-printed="true">
            <span className="film-print film-label">Next</span>
            <span className="film-leader" aria-hidden />
            <Link href="/build" className="film-print film-value film-link">
              Take this to the builder →
            </Link>
          </div>
        )}

        {/* The kitchen's own line for the chapter you are in. Not announced:
            at scrub rate a live region is a firehose, and the ordered list of
            chapters below carries the same content at a readable pace. */}
        <p
          className="mt-[16px] min-h-[52px] text-[length:var(--prose-sm)] text-ink-60"
          aria-hidden
        >
          {caption ?? ""}
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE FILM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * NetworkInformation, where it exists at all. Not every browser ships it, and
 * the server has no navigator, so every read is optional.
 */
interface Connection {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

const connection = (): Connection | undefined =>
  (navigator as unknown as { connection?: Connection }).connection;

/* A phone can drop off wifi onto 3G halfway down the film, and the frame track
   is the most expensive thing on the page to be wrong about. */
const subscribeThrifty = (onChange: () => void) => {
  const c = connection();
  c?.addEventListener?.("change", onChange);
  return () => c?.removeEventListener?.("change", onChange);
};

const readThrifty = () => {
  const c = connection();
  return Boolean(c?.saveData) || /(^|-)2g$/.test(c?.effectiveType ?? "");
};

/**
 * Reduced motion, Save-Data, or a 2G connection all get the same thing: seven
 * stills and the finished ticket. The film is an explanation, and there is more
 * than one reason not to be able to afford it.
 *
 * The connection is a platform API rather than React state, so it is read
 * through useSyncExternalStore. Server render says false — it has no navigator
 * — and the client corrects it during hydration without a cascading render.
 */
function useLightweight(): boolean {
  const reduced = useReducedMotion();
  const thrifty = useSyncExternalStore(subscribeThrifty, readThrifty, () => false);
  return reduced || thrifty;
}

export function Film({
  ticketNo,
  lines,
  poster,
}: {
  ticketNo: string;
  lines: TicketLine[];
  /** The first frame, inlined by the server. It is the LCP element. */
  poster?: string;
}) {
  const still = useLightweight();
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { manifest, draw, startStream } = useFilmTrack(still);

  const [chapter, setChapter] = useState(0);
  const [printed, setPrinted] = useState<string[]>([]);
  const [appended, setAppended] = useState(false);
  const [calloutCount, setCalloutCount] = useState(0);

  useEffect(() => {
    if (still) return;
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    const schedule = buildSchedule();
    const toFilm = makeToFilm(manifest);
    const order = lines.map(l => l.slug);

    const apply = (p: number) => {
      draw(canvas.current, toFilm(p));
      if (p > 1 / CHAPTERS.length) startStream();

      const next = order.filter(s => p >= (schedule.points[s] ?? 2));
      setPrinted(prev => (prev.length === next.length ? prev : next));
      setAppended(p >= schedule.appendAt);

      let ch = 0;
      for (let i = 0; i < schedule.starts.length; i++) {
        if (p >= schedule.starts[i]) ch = i;
      }
      setChapter(ch);

      const own = CALLOUTS.filter(c => c.chapter === CHAPTERS[ch].id);
      if (!own.length) {
        setCalloutCount(0);
        return;
      }
      const s = schedule.starts[ch];
      const e = ch + 1 < schedule.starts.length ? schedule.starts[ch + 1] : 1;
      const within = (p - s) / Math.max(e - s, 1e-6);
      setCalloutCount(
        Math.round(Math.min(own.length, Math.max(0, (within - 0.25) / 0.55) * own.length)),
      );
    };

    /* GSAP loads only for readers who actually get the scrub — the still path
       should not ship a scroll engine it never runs. */
    void (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const proxy = { p: 0 };
        gsap.to(proxy, {
          p: 1,
          ease: "none",
          /* On the TWEEN, not the ScrollTrigger: a trigger's own onUpdate fires
             the moment scroll changes, when a scrubbed tween has not moved yet,
             so it reports where the film was one scroll event ago — a whole
             chapter of lag on a seven-chapter pin. */
          onUpdate: () => apply(proxy.p),
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.5,
          },
        });
      }, root);
      apply(0);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [still, manifest, draw, startStream, lines]);

  if (still) {
    return <StillFilm ticketNo={ticketNo} lines={lines} manifest={manifest} poster={poster} />;
  }

  const printedSet = new Set(printed);
  const active = printed.length ? printed[printed.length - 1] : null;
  const current = CHAPTERS[chapter];
  const finished = printedSet.size === lines.length;

  return (
    <section
      ref={root}
      className="film relative"
      aria-label="How a cake is specified, in seven steps"
      data-warm={printedSet.has("sponge")}
      style={{ height: `${CHAPTERS.length * 100}vh` }}
    >
      {/* The canvas is a picture that changes under a thumb, which is nothing to
          a screen reader. This is the same content, at a readable pace. */}
      <div className="sr-only">
        <ol>
          {CHAPTERS.map(c => (
            <li key={c.id}>{c.shows}</li>
          ))}
        </ol>
        <dl>
          {lines.map(l => (
            <div key={l.slug}>
              <dt>{l.label}</dt>
              <dd>
                {l.value}
                {l.appended ?? ""}
              </dd>
            </div>
          ))}
          <div>
            <dt>Total</dt>
            <dd>{CHAPTER_TOTALS[CHAPTER_TOTALS.length - 1]}</dd>
          </div>
        </dl>
      </div>

      <div className="sticky top-0 h-dvh overflow-hidden pt-[88px] pb-[24px]">
        <div className="mx-auto grid h-full max-w-[1400px] grid-cols-1 gap-[24px] px-[24px] md:grid-cols-12 md:gap-[48px] md:px-[48px]">
          <div className="flex min-h-0 flex-col md:col-span-7">
            <Specimen
              canvasRef={canvas}
              poster={poster}
              chapterId={current.id}
              calloutCount={calloutCount}
            />
            {/* Off the photograph and onto the paper, with a thumb-sized target:
                it used to be an 11px dotted link laid over the image, the
                lowest-contrast thing in the specimen. */}
            <a href="#intake" className="film-skip">
              Skip to the ticket ↓
            </a>
          </div>

          <div className="min-h-0 overflow-hidden md:col-span-5">
            <Ticket
              ticketNo={ticketNo}
              lines={lines}
              printed={printedSet}
              active={active}
              appended={appended}
              caption={current.caption ?? null}
              total={CHAPTER_TOTALS[chapter]}
              finished={finished}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Specimen({
  canvasRef,
  poster,
  chapterId,
  calloutCount,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  poster?: string;
  chapterId: string;
  calloutCount: number;
}) {
  const own = CALLOUTS.filter(c => c.chapter === chapterId).slice(0, calloutCount);

  return (
    <div className="film-specimen min-h-0 flex-1">
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt="A Belgian Chocolate sponge stack on a brushed-steel cake board"
          className="film-poster absolute inset-0"
          fetchPriority="high"
        />
      )}
      <canvas ref={canvasRef} className="relative z-[1]" aria-hidden />

      {own.map(c => (
        <div
          key={c.label}
          className="film-callout"
          data-side={c.side}
          style={{ left: `${c.x}%`, top: `${c.y}%` }}
        >
          <span className="film-callout-rule" />
          <span className="film-callout-label">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The lightweight path. Nothing is pinned and nothing is scrubbed: the seven
 * chapters are seven stills down the page with the ticket already printed.
 * Somebody who asked for less motion — or whose phone asked for fewer bytes —
 * asked not to have a film dragged under their thumb, not to be shown less cake.
 */
function StillFilm({
  ticketNo,
  lines,
  manifest,
  poster,
}: {
  ticketNo: string;
  lines: TicketLine[];
  manifest: Manifest | null;
  poster?: string;
}) {
  const all = new Set(lines.map(l => l.slug));

  return (
    <section className="film" data-warm="true" aria-label="How a cake is specified">
      <div className="mx-auto max-w-[1400px] px-[24px] py-[64px] md:px-[48px]">
        <Ticket
          ticketNo={ticketNo}
          lines={lines}
          printed={all}
          active={null}
          appended
          caption={null}
          total={CHAPTER_TOTALS[CHAPTER_TOTALS.length - 1]}
          finished
        />
        <div className="mt-[48px] grid gap-[48px]">
          {CHAPTERS.map((ch, i) => {
            const start =
              manifest?.chapters?.find(c => c.id === ch.id)?.start ?? FALLBACK_STARTS[i];
            const frame = manifest
              ? frameUrl(manifest.pattern, Math.round(start * (manifest.count - 1)))
              : i === 0
                ? poster
                : null;
            return (
              <figure key={ch.id}>
                <div className="film-specimen aspect-[4/3] w-full">
                  {frame && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={frame} alt={ch.shows} className="film-poster" loading="lazy" />
                  )}
                </div>
                <figcaption className="mt-[12px] text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase">
                  {ch.shows}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
