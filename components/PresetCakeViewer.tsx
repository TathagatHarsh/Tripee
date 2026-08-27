"use client";

import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CakeConfig } from "@/lib/schema";
import { CARD_BUDGET } from "@/lib/quality";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Shot } from "@/components/three/CakeScene";
import type { TurntableDrive } from "@/components/three/Turntable";

/**
 * A preset's cake, live and turning, sized to fill whatever well it is put in.
 *
 * The cake is the real one: this hands a `CakeConfig` straight to the same
 * `CakeScene` the builder and the hero draw, so what is on a card is exactly
 * what its "Order now" loads. There is no second renderer, no per-preset
 * geometry and nothing baked — the only things this component decides are *when*
 * to draw and *how much* to spend, both of which are page concerns rather than
 * cake ones.
 *
 * Loaded, gated and budgeted, in that order:
 *
 *   · the 3D bundle is imported on demand and only once a card is near the
 *     viewport, so a customer who never scrolls to the presets never pays for
 *     three.js;
 *   · once mounted it stays mounted while it can — scrolling back up to a card
 *     must not re-run a loading state — but it stops being *drawn* the moment it
 *     leaves, which is what keeps a page of these affordable, and it gives up its
 *     context if the page runs out (see LIVE_LIMIT below);
 *   · what it may spend is capped by quality.CARD_BUDGET, on top of whatever the
 *     device itself measured.
 */

/*
 * React.lazy rather than next/dynamic, which is what the rest of the app uses
 * (three/LazyCakeScene). The difference is the fallback: `dynamic`'s `loading`
 * is fixed at module scope and cannot see a prop, and the placeholder here is
 * drawn from the cake's own frosting colour. Suspense takes a fallback as a
 * child, so it can.
 */
const CakeScene = lazy(() =>
  import("@/components/three/CakeScene").then(m => ({ default: m.CakeScene })),
);

/**
 * How many of these may hold a WebGL context at the same time.
 *
 * Not a performance tuning knob — a hard browser ceiling. Chrome keeps about
 * sixteen live contexts per renderer process and, past that, silently kills the
 * *oldest* to make room for the newest. Measured on this page: at twenty cards,
 * four contexts were gone, and because the oldest are the ones at the top of the
 * catalogue, the four it took were the first four cakes a customer ever sees. They
 * do not error, they do not warn, they just stop being drawn.
 *
 * Twelve, so the browser is never the one making the choice — the point is to
 * evict deliberately rather than to squeeze under the limit. Measured against the
 * other number that matters: at 1680×1050 the widest layout puts sixteen cards
 * inside the observer's draw band at once, of which about ten are actually in the
 * viewport and the rest are in the 260px lead-in margin. Twelve therefore covers
 * every visible card with two spare, and the cards it gives up are ones nobody is
 * looking at.
 */
const LIVE_LIMIT = 12;

/** Who currently holds a context, and how to ask them to let it go. */
const live = new Map<Element, () => void>();

/**
 * Distance from the middle of the viewport, in pixels.
 *
 * The eviction order is by distance and not by age, which is the whole reason for
 * doing this by hand rather than letting the browser do it. Age is exactly the
 * wrong key on a scrolling catalogue: the oldest context belongs to the card at
 * the top of the page, which on the way back up is the next one to be looked at.
 */
function farness(el: Element): number {
  const r = el.getBoundingClientRect();
  return Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2);
}

/**
 * Take a context for `el`, dropping the furthest-away holders if that puts the
 * page over the limit.
 *
 * Called every time a card enters the band rather than once when it mounts, so the
 * distances are re-read against where the page has actually scrolled to. `el`
 * itself is never the victim: it has just been reported as intersecting, so it is
 * inside the band, and anything still holding a context from further up or down
 * the page is further away than that.
 */
function admit(el: Element, release: () => void) {
  live.set(el, release);
  if (live.size <= LIVE_LIMIT) return;

  [...live.keys()]
    .sort((a, b) => farness(b) - farness(a))
    .slice(0, live.size - LIVE_LIMIT)
    .forEach((victim) => {
      live.get(victim)?.();
      live.delete(victim);
    });
}

/**
 * Whether this browser can draw a cake at all — asked once per document, not
 * once per card.
 *
 * The probe costs a real WebGL context, and eight cards each opening one to ask
 * a question every card has the same answer to is how a page runs into the
 * browser's context limit and loses the contexts it actually wanted. Cached, and
 * the probe's own context is handed straight back.
 */
let webglSupport: boolean | null = null;

function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;

  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webglSupport = !!gl;
  } catch {
    webglSupport = false;
  }

  return webglSupport;
}

/**
 * There is nothing to subscribe to: a document either has WebGL for its whole
 * life or it never had it. Read through `useSyncExternalStore` all the same —
 * the same way lib/useReducedMotion reads its media query — because that is how
 * a client-only fact is sampled during render without an effect that sets state
 * on mount and re-renders every card a second time. The server's answer is
 * "yes", which costs nothing: nothing is mounted server-side either way.
 */
const NEVER_CHANGES = () => () => {};

export function PresetCakeViewer({
  config, shot,
}: {
  config: CakeConfig;
  /** How to photograph it — camera, crop, exposure. See three/CakeScene.Shot. */
  shot: Shot;
}) {
  const box = useRef<HTMLDivElement>(null);
  /* Written by the pointer handlers below, read in the frame loop by
     three/Turntable. Never state: a pointer crossing a grid of cards must not
     re-render one WebGL scene per card it passes over. */
  const drive = useRef<TurntableDrive>({ hovered: false });
  const reduced = useReducedMotion();

  /** Near the viewport right now — whether it should be *drawn*. */
  const [near, setNear] = useState(false);
  /**
   * Whether it should be *mounted*, which is to say holding a WebGL context.
   *
   * Sticky on the way out — leaving the viewport does not unmount, because a
   * customer scrolling back up must not watch a loading state replay. The one
   * thing that takes it back down is the page running out of contexts, and then
   * only for a card that is a long way from being looked at. See `admit`.
   */
  const [mounted, setMounted] = useState(false);
  const webgl = useSyncExternalStore(NEVER_CHANGES, supportsWebGL, () => true);

  useEffect(() => {
    /* Nothing to watch for if there is no renderer to hand the card to. */
    if (!webgl) return;

    const el = box.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setNear(entry.isIntersecting);
        if (!entry.isIntersecting) return;
        setMounted(true);
        admit(el, () => setMounted(false));
      },
      /*
       * A screen-ish of lead time. Loading and spinning start just before a card
       * is seen, so nothing is ever caught standing still at the moment it
       * scrolls into view — a cake that begins turning as it arrives reads as a
       * page reacting to a scroll, which is the opposite of the brief.
       */
      { rootMargin: "260px 0px" },
    );

    io.observe(el);
    return () => {
      io.disconnect();
      /* Leaving the registry behind would hold a dead node — and a stale
         setMounted on an unmounted tree — for the life of the document. */
      live.delete(el);
    };
  }, [webgl]);

  return (
    <div
      ref={box}
      /*
       * `touch-pan-y` so a vertical swipe over a canvas still scrolls the page.
       * OrbitControls is mounted with rotate, zoom and pan all off — it is only
       * there to aim the camera — but it still attaches touch handlers, and a
       * column of eight canvases that each swallow a swipe is a phone page you
       * cannot get down.
       */
      className="relative h-full w-full touch-pan-y"
      /*
       * Mouse only. A tap on a touchscreen fires pointerenter and then never
       * fires pointerleave, so on a phone this would latch every card it touched
       * into its hover speed permanently. Touch devices get the slow rotation and
       * nothing that depends on a pointer being *somewhere*.
       */
      onPointerEnter={e => {
        if (e.pointerType === "mouse") drive.current.hovered = true;
      }}
      onPointerLeave={() => {
        drive.current.hovered = false;
      }}
    >
      {webgl && mounted ? (
        <Suspense fallback={<CakeGhost config={config} />}>
          <CakeScene
            config={config}
            interactive={false}
            shot={shot}
            budget={CARD_BUDGET}
            /*
             * Reduced motion stops the turntable rather than hiding the cake:
             * with no frames ever asked for, the group is never touched and the
             * cake sits at rotation zero — which is the angle its shot was
             * composed for. The still pose is the art-directed one.
             */
            turntable={{ drive, active: near && !reduced }}
          />
        </Suspense>
      ) : (
        <CakeGhost config={config} />
      )}
    </div>
  );
}

/**
 * What stands in the well before the scene arrives, and instead of it on a
 * browser with no WebGL at all.
 *
 * There is no photograph to fall back to and there should not be one — see
 * lib/photos on why this project refuses to put stock cake imagery next to its
 * own work. So the fallback is the only honest thing to hand: the cake's own
 * frosting colour, in its own number of tiers, on a plate. It reads as a card
 * whose cake has not loaded rather than as a card that is broken, and at eight
 * cards it is quiet enough to scroll past.
 *
 * Deliberately not pulsing. Most of these are below the fold on a page that has
 * eight of them, and eight throbbing rectangles is a busier page than eight
 * still ones.
 */
function CakeGhost({ config }: { config: CakeConfig }) {
  const tiers: { x: number; y: number; w: number; h: number; r: number }[] = [];
  let base = 68;

  for (let i = 0; i < Math.min(Math.max(config.tiers, 1), 3); i++) {
    const w = 60 - i * 15;
    const h = 21 - i * 2;
    tiers.push({ x: 50 - w / 2, y: base - h, w, h, r: w * 0.1 });
    base -= h;
  }

  return (
    <svg viewBox="0 0 100 100" aria-hidden className="h-full w-full">
      {/* The pool of shadow the cake would be sitting in. */}
      <ellipse cx="50" cy="70.5" rx="34" ry="5" fill="#31261C" opacity="0.12" />
      {/* The board. */}
      <ellipse cx="50" cy="68.4" rx="30" ry="4.2" fill="#D9D3C4" />
      {tiers.map(t => (
        <rect
          key={t.y}
          x={t.x} y={t.y} width={t.w} height={t.h} rx={t.r}
          fill={config.frostingColor}
        />
      ))}
    </svg>
  );
}
