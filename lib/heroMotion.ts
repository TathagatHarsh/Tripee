/**
 * Timings for the hero's entrance, shared by the two halves that play it.
 *
 * There are two GSAP timelines, not one: the copy animates in the DOM and the
 * cake animates inside a WebGL canvas that is code-split and Suspense-gated, so
 * it does not exist yet when the page first paints. One timeline spanning both
 * would have to either block on the 3D bundle or fire the cake's half into the
 * void. Two timelines that start when their own subject is ready, off one set of
 * numbers, land as one gesture — the eye reads the shared ease and overlap, not
 * a shared clock.
 *
 * No `gsap` or `three` import here. This module is pulled into the DOM bundle,
 * and the point of that split is to keep three.js out of it.
 */

/** Editorial, not springy: fast out of the gate, long settle, no overshoot. */
export const HERO_EASE = "power3.out";

/** The copy: each line lifts into place a beat after the one above it. */
export const HERO_TEXT = {
  duration: 0.85,
  stagger: 0.085,
  /** Pixels. Small on purpose — this is a settle, not an entrance from offstage. */
  shift: 18,
} as const;

/**
 * The cake: starts smaller and lower, then rises and grows into frame.
 *
 * Slower than the copy and started under it, so the words are readable before
 * the cake finishes arriving rather than the two competing for the eye.
 */
export const HERO_CAKE_IN = {
  duration: 1.5,
  /** Scale it grows from. */
  from: 0.86,
  /** World units it rises through. */
  lift: 0.42,
} as const;
