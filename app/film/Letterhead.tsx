"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SLOTS } from "@/lib/delivery";
import { mulberry32 } from "@/lib/seed";

/**
 * Seeded rotations, so a stamp lands at a believable angle and lands at the
 * same believable angle on the server and in the browser. Math.random() here
 * would be a hydration mismatch dressed up as character.
 */
const rng = mulberry32(7412);
const WORDMARK_ANGLE = (rng() * 4 - 2).toFixed(2);
const STAMP_ANGLE = (rng() * 8 - 4).toFixed(2);

/**
 * The masthead behaves as a letterhead, which means it does not sell anything.
 * There is no button here: a letterhead carries who you are, where you are and
 * when you are open, and a call to action printed at the top of one is a flyer.
 *
 * Past 200px it Feeds down from 88px to 48px — the paper advancing, not the
 * header fading, because a letterhead that dissolves was never on paper.
 */
export function Masthead() {
  const [fed, setFed] = useState(false);

  useEffect(() => {
    const onScroll = () => setFed(window.scrollY > 200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="film-masthead sticky top-0 z-50 bg-paper" data-fed={fed}>
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-[24px] px-[24px] md:px-[48px]">
        <Wordmark />

        <div className="hidden text-[length:var(--mono-xs)] leading-[1.45] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase sm:block">
          <div>Road No. 36, Jubilee Hills</div>
          <div>Hyderabad 500033</div>
        </div>

        <div className="ml-auto flex items-center gap-[24px]">
          <span className="hidden text-[length:var(--mono-xs)] tracking-[var(--tracking-mono-xs)] text-ink-60 uppercase md:inline">
            Counter {SLOTS.pickup.window.replace("Collect ", "")}
          </span>
          <Link href="/presets" className="film-link">
            The catalogue
          </Link>
          <Link href="/build" className="film-link">
            Build one
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The wordmark is a stamp, not a heading — it is struck onto the paper, so its
 * edges break where the ink did not take.
 *
 * The letters are SVG text rather than outlined paths, which is the one place
 * this falls short of "never live text": outlining Geist Mono needs a
 * font-to-path step the repo has no tooling for. The displacement filter and
 * the seeded angle carry the rest, and `aria-hidden` on the glyphs with a label
 * on the svg keeps it a mark rather than a paragraph.
 */
function Wordmark() {
  return (
    <svg
      viewBox="0 0 300 34"
      className="h-[22px] w-auto shrink-0 text-ink"
      role="img"
      aria-label="Makemycake"
      style={{ transform: `rotate(${WORDMARK_ANGLE}deg)` }}
    >
      <filter id="mm-ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7412" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <text
        x="0"
        y="25"
        aria-hidden="true"
        fill="currentColor"
        filter="url(#mm-ink)"
        fontFamily="var(--font-mono)"
        fontSize="26"
        fontWeight="500"
        letterSpacing="0.14em"
      >
        MAKEMYCAKE
      </text>
    </svg>
  );
}

/**
 * The one Stamp on the whole page, and the one use of --stamp.
 *
 * It says the thing a customer is actually wondering at the moment they reach a
 * button: whether pressing it costs them anything. It does not.
 */
export function Stamp() {
  return (
    <svg
      viewBox="0 0 240 76"
      className="film-stamp h-[76px] w-[240px] text-stamp"
      role="img"
      aria-label="Nothing paid yet"
      style={{ ["--stamp-angle" as string]: `${STAMP_ANGLE}deg` }}
    >
      <filter id="mm-stamp">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" seed="36" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <g filter="url(#mm-stamp)" opacity="0.86">
        <rect x="3" y="3" width="234" height="70" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="9" y="9" width="222" height="58" fill="none" stroke="currentColor" strokeWidth="1" />
        <text
          x="120"
          y="45"
          aria-hidden="true"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="var(--font-mono)"
          /* 16 characters at 19px/0.18em measure 237px inside a 222px die, which
             sliced the first and last letter. 17/0.15 measures 204px and leaves an
             even margin at both ends — a stamp that does not fit its own box is the
             most damaging possible defect on a page about printing things correctly. */
          fontSize="17"
          fontWeight="500"
          letterSpacing="0.15em"
        >
          NOTHING PAID YET
        </text>
      </g>
    </svg>
  );
}
