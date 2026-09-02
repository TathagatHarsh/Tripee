"use client";

import { useEffect, useState } from "react";

export type QualityTier = "high" | "low";

export interface QualitySettings {
  tier: QualityTier;
  dpr: [number, number];
  /** Radial segments for lathe geometry. */
  segments: number;
  shadows: boolean;
  contactShadows: boolean;
  /** Toppings above this count get thinned out. */
  maxInstances: number;
  antialias: boolean;
}

export const HIGH: QualitySettings = {
  tier: "high",
  dpr: [1, 2],
  segments: 72,
  shadows: true,
  contactShadows: true,
  maxInstances: 80,
  antialias: true,
};

/**
 * `dpr` is a clamp on the device's own pixel ratio, and 1 was the harshest value
 * available. On a phone reporting 3, that drew the cake at a ninth of the screen's
 * pixels and left the browser to upscale — which is what "the render quality is
 * very bad on mobile" is, and this file's own comment above `useQuality` already
 * says a downgrade here "is very visible and completely silent".
 *
 * Resolution should be the *last* thing a weak device gives up, because it is the
 * only one of these five the eye reads directly. Segments, shadows, instances and
 * antialiasing are all cheaper to lose and LOW still loses all four. 1.5 is a
 * bounded step — 2.25x the pixels of 1, still well under a modern phone's 3.
 */
export const LOW: QualitySettings = {
  tier: "low",
  dpr: [1, 1.5],
  segments: 32,
  shadows: false,
  contactShadows: true,
  maxInstances: 32,
  antialias: false,
};

function guess(): QualitySettings {
  if (typeof navigator === "undefined") return HIGH;

  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  if (cores <= 4) return LOW;
  if (memory !== undefined && memory <= 4) return LOW;
  if (mobile && cores <= 6) return LOW;
  return HIGH;
}

let measured: QualitySettings | null = null;

/** How long to let the page settle before believing anything it reports. */
const SETTLE_MS = 1800;
/** How long a sample runs. */
const SAMPLE_MS = 1400;
/**
 * Enough gaps between frames to take a median of.
 *
 * The reading is a *median* interval rather than a frame count or an average,
 * and each of the alternatives fails on a case seen in practice:
 *
 *   · Frames per second cannot tell a weak device from a parked tab — both
 *     report single digits.
 *   · The shortest interval is fooled by a burst. A throttled tab was measured
 *     delivering three frames in two seconds with two of them 17ms apart, which
 *     looks instant by that test.
 *   · A frame count alone cannot tell "parked" from "genuinely managing five
 *     frames a second", and a device doing five needs the downgrade.
 *
 * The median sees through all three. A parked tab's typical gap is about a
 * second, a struggling phone's is 60–200ms, and a healthy one's is 16ms — and
 * one stall in the middle of an otherwise fine sample cannot move it, which an
 * average would let happen.
 */
const MIN_INTERVALS = 6;
/** A typical gap this long means the page is not being drawn, merely polled. */
const PARKED_GAP_MS = 400;
/** Give up and keep the guess rather than retrying forever. */
const MAX_ATTEMPTS = 4;

/**
 * Cheap up-front guess, then a real frame-rate check. Chrome desktop with mobile
 * emulation tells you nothing about a ₹15,000 Android — the runtime check is the
 * one that counts.
 *
 * The care here is all about not believing a bad sample, because the result is
 * cached for the session: one wrong reading and every cake on the site is soft
 * until the tab is closed. LOW means a canvas at device-pixel-ratio 1 on a retina
 * screen, 32-segment lathes and no antialiasing, so a false downgrade is very
 * visible and completely silent.
 *
 * Two ways the old check got it wrong on a fast machine, both of which made the
 * cakes blurry:
 *
 *   · It started measuring immediately, so its window was the page's own
 *     startup — parse, hydrate, build twelve lathe geometries, render an
 *     environment cubemap. That is the slowest 1.2 seconds of the page's life and
 *     it is not what the next ten minutes will look like.
 *   · It read a throttled tab as a slow GPU. A hidden or backgrounded tab gets
 *     roughly one frame a second, which is far below any threshold, so opening
 *     the site in a background tab — an entirely ordinary thing to do — pinned it
 *     to LOW before it was ever looked at.
 *
 * So: wait for the page to settle, only measure while it is visible, throw away
 * any sample that was throttled or interrupted rather than concluding from it,
 * and give up after a few attempts instead of retrying forever.
 */
export function useQuality(): QualitySettings {
  const [settings, setSettings] = useState<QualitySettings>(() => measured ?? guess());

  useEffect(() => {
    if (measured) return;

    let raf = 0;
    let timer = 0;
    let done = false;
    let attempts = 0;

    let startedAt = 0;
    let previous = 0;
    let gaps: number[] = [];

    /* Declarations rather than consts: `sample` refers to `retry` and `retry`
       refers to `sample`, and one of them has to come second. */
    function retry() {
      raf = 0;
      if (done || attempts >= MAX_ATTEMPTS) return;
      timer = window.setTimeout(start, SETTLE_MS);
    }

    function start() {
      timer = 0;
      if (done || measured || document.hidden || attempts >= MAX_ATTEMPTS) return;
      attempts++;
      gaps = [];
      previous = 0;
      startedAt = performance.now();
      raf = requestAnimationFrame(sample);
    }

    function sample(now: number) {
      if (done) return;

      // Went away mid-sample; the count is spoiled by the throttle.
      if (document.hidden) return retry();

      if (previous) gaps.push(now - previous);
      previous = now;

      if (now - startedAt < SAMPLE_MS) {
        raf = requestAnimationFrame(sample);
        return;
      }

      /* Not enough gaps to take a median of — ask again rather than condemning
         the machine on two data points. */
      if (gaps.length < MIN_INTERVALS) return retry();

      gaps.sort((a, b) => a - b);
      const typical = gaps[gaps.length >> 1];

      /* Being polled once a second, not rendered. Nothing to conclude. */
      if (typical > PARKED_GAP_MS) return retry();

      const fps = 1000 / typical;
      const next = fps < 40 ? LOW : settings;
      measured = next;
      if (next.tier !== settings.tier) setSettings(next);
    }

    const onVisibility = () => {
      if (!document.hidden && !raf && !timer && !measured) retry();
    };

    document.addEventListener("visibilitychange", onVisibility);
    timer = window.setTimeout(start, SETTLE_MS);

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [settings]);

  return settings;
}

/**
 * What one card-sized canvas may spend, laid over whatever the device measured.
 *
 * One override, because everything else this used to set was a worse copy of a
 * decision `guess()` and the frame-rate probe already make. It pinned the device
 * pixel ratio at 1.5, the lathe at 48 segments, instances at 36 and the tier at
 * low — and every one of those sits *between* the two tiers, so it did the
 * opposite of its job at both ends. On a retina display it drew the cake at three
 * quarters of the screen's linear resolution and left the browser to upscale it,
 * which is precisely what "the cakes look blurry" is; on a weak phone it pushed
 * resolution and segment count *above* what LOW had just decided that device
 * could take. A ceiling lower than the good case and higher than the bad one is
 * not a budget.
 *
 * So resolution, geometry, instance count and antialiasing all come from the
 * measurement now: a good machine gets the same crisp cake the hero gets, and a
 * weak one still gets LOW's numbers.
 *
 * What stays is the one cost that is genuinely about there being eight of these
 * rather than one — the key light's 2048² shadow map, redrawn per card per frame
 * for a cake 300 pixels wide. The contact shadow grounds it instead, at a
 * fraction of the size, and `CakeBoard`'s baked occlusion already carries the
 * cake-to-board and tier-to-tier contact the key light's shadow would be drawing.
 *
 * What makes that affordable is *when* the cards draw rather than how well: 30fps
 * and only while near the viewport (see three/Turntable), which saves far more
 * than any of the fidelity cuts this used to make.
 */
export const CARD_BUDGET: Partial<QualitySettings> = {
  shadows: false,
};
