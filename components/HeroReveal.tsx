"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { HERO_EASE, HERO_TEXT } from "@/lib/heroMotion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Lifts the hero's copy into place on load, one line after the next.
 *
 * It animates its own direct children, so the page keeps its markup: the
 * eyebrow, the headline, the paragraph, the buttons and the metadata row are
 * still written where they were, in the order they read. Nothing here knows what
 * any of them are, which is the point — editing the copy does not mean editing
 * an animation.
 *
 * THE FLASH, AND WHY THERE IS A STYLESHEET IN HERE
 *
 * `gsap.from` inside a layout effect is the usual no-flash recipe and it is not
 * enough on a server-rendered page. The server sends the finished hero, the
 * browser paints it, and only then does React hydrate and the effect run — so
 * measured, the headline went opacity 1 → 0.10 → 1, which is a blink on the
 * first thing anybody reads.
 *
 * So the start state ships in the markup, as a rule the server renders with the
 * element. `fromTo` then sets the same values inline before the first hydrated
 * paint, which beats the rule on specificity, and the attribute set alongside it
 * retires the rule for good so nothing is left fighting `clearProps`.
 *
 * The `<noscript>` is the part that makes this safe rather than clever: a rule
 * that hides content until script says otherwise is a page that stays blank when
 * the script never arrives, and this is a bakery's front door. Reduced motion is
 * handled in the same stylesheet for the same reason — it must be true before
 * any JavaScript has had an opinion.
 */
const FROM_STATE = `
[data-hero-reveal] > * { opacity: 0; transform: translateY(${HERO_TEXT.shift}px); }
[data-hero-reveal][data-hero-shown] > * { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  [data-hero-reveal] > * { opacity: 1; transform: none; }
}
`;

const NO_SCRIPT = `[data-hero-reveal] > * { opacity: 1 !important; transform: none !important; }`;

export function HeroReveal({
  className, children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;

    // Reduced motion gets the finished page, not a faster animation. The rule
    // above already left it visible; this only takes the rule out of the way.
    if (reduced) {
      el.dataset.heroShown = "";
      return;
    }

    const lines = Array.from(el.children);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        lines,
        { opacity: 0, y: HERO_TEXT.shift },
        {
          opacity: 1,
          y: 0,
          duration: HERO_TEXT.duration,
          stagger: HERO_TEXT.stagger,
          ease: HERO_EASE,
          // Cleared afterwards so nothing is left holding a transform or an
          // opacity on elements the rest of the page has to lay out and hover.
          clearProps: "opacity,transform",
        },
      );
    }, root);

    // Inline styles are in place, so the rule has done its job.
    el.dataset.heroShown = "";

    return () => ctx.revert();
  }, [reduced]);

  return (
    <>
      <style>{FROM_STATE}</style>
      <noscript><style>{NO_SCRIPT}</style></noscript>
      <div ref={root} data-hero-reveal className={className}>{children}</div>
    </>
  );
}
