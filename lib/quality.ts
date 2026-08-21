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

export const LOW: QualitySettings = {
  tier: "low",
  dpr: [1, 1],
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

/**
 * Cheap up-front guess, then a real frame-rate check. Chrome desktop with mobile
 * emulation tells you nothing about a ₹15,000 Android — the runtime check is the
 * one that counts.
 */
export function useQuality(): QualitySettings {
  const [settings, setSettings] = useState<QualitySettings>(() => measured ?? guess());

  useEffect(() => {
    if (measured) return;

    let frames = 0;
    let raf = 0;
    const start = performance.now();

    const tick = () => {
      frames++;
      const elapsed = performance.now() - start;
      if (elapsed < 1200) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const fps = (frames / elapsed) * 1000;
      const next = fps < 40 ? LOW : settings;
      measured = next;
      if (next.tier !== settings.tier) setSettings(next);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settings]);

  return settings;
}

/**
 * What one card-sized canvas may spend, laid over whatever the device measured.
 *
 * The presets page mounts eight of these. Two things dominate at that count, and
 * neither buys anything at 300 pixels across: the key light's 2048² shadow map,
 * eight of them, redrawn on every frame the cake turns; and device-pixel-ratio 2
 * on a retina display, which quadruples the fill rate for a canvas nobody is
 * inspecting. Both come down. Everything about the *look* — the light rig, the
 * materials, the tone mapping — is untouched, because a cheap cake and a badly
 * lit cake are different problems.
 *
 * The contact shadow stays. It is 256², it is the only thing left putting the
 * cake on a table rather than in mid-air, and it is what the directional
 * shadow's absence would otherwise be noticed as.
 *
 * A weak device still wins: this is spread over `guess()`/`measure()`'s result,
 * so a phone that came back LOW keeps LOW's 32 segments rather than gaining 48.
 */
export const CARD_BUDGET: Partial<QualitySettings> = {
  /* Read in exactly one place — the contact shadow's map size — so this says
     "256 is enough here" rather than making any claim about the device. */
  tier: "low",
  dpr: [1, 1.5],
  segments: 48,
  shadows: false,
  maxInstances: 36,
};
