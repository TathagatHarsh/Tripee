"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/format";
import { AUTO_TRACK_MS, trackingPlan } from "@/lib/orders";
import { sBtn } from "@/lib/shopUi";

/**
 * The moment the order lands.
 *
 * ## What it is allowed to claim
 *
 * That the order was placed, and nothing else. It renders only after
 * `/api/orders` has answered 2xx, which is the point at which the rows are
 * committed, the references are minted and the guest cookie is set — see
 * app/api/orders. It does not place the order, does not re-check it, and does
 * not read or invent a status: every order in this product starts at `draft`,
 * and "your cake is being baked" is the tracking page's sentence to say when an
 * OrderEvent says so.
 *
 * There is no payment state to wait on. `Order.paymentStatus` is written `none`
 * by the route and the shop is payable on delivery — the gateway hook in
 * prisma/schema.prisma is a hook and not an integration. When one lands, the
 * condition for showing this screen moves from "the route said yes" to "the
 * route said yes *and* the server-side verification settled", and it moves in
 * app/checkout, not here: this file's whole job is to celebrate a fact it was
 * handed.
 *
 * ## Why it is not a route
 *
 * `/order-success?ref=MC-8B3JQK` would put a reference in a URL, and a
 * reference in a URL is a thing somebody can type, bookmark, share and reload.
 * The confirmation has always been rendered in place for that reason — the note
 * on app/build/review says so in as many words — and a route would additionally
 * have to survive a refresh with the cart already emptied, which is a second
 * copy of the order's state living in a query string.
 *
 * In place means a refresh cannot replay anything: this is a branch of the
 * checkout form's own state, so reloading /checkout is a reload of an empty
 * cart, and Back from the tracking page lands on /cart with nothing in it.
 *
 * ## The redirect
 *
 * `router.replace`, so the confirmation does not become a history entry
 * somebody can go Back into — and client-side, so the tracking page streams in
 * rather than the browser starting again from a blank document.
 *
 * It cancels itself the moment the customer does anything deliberate. An
 * automatic navigation is fine when somebody is watching an animation finish
 * and wrong when they are reading their order reference, tabbing to the button
 * or scrolling; the cheapest way to tell those apart is that the second group
 * touches the keyboard or the screen. The button is what they are left with,
 * and the button is always there.
 */
export function OrderPlaced({
  refs,
  totalPaise,
}: {
  refs: string[];
  totalPaise: number;
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const plan = trackingPlan(refs);
  const many = false;

  /* Whether the redirect is still coming. Rendered, not just held: a line that
     keeps promising a navigation which has been cancelled is the one way this
     screen can lie to somebody. */
  const [auto, setAuto] = useState(plan?.auto ?? false);

  /*
   * Focus lands on the heading rather than staying on a button that no longer
   * exists. Without it a keyboard or screen-reader user presses "Place order",
   * the form is replaced, focus falls back to <body>, and the confirmation they
   * have been waiting for is never announced.
   *
   * An effect and not `autoFocus`: HTML autofocus is specified for elements
   * present at parse time and is unreliable on a node React inserts later.
   *
   * The window is scrolled first, and the focus then asks not to scroll again.
   * Both halves matter. This replaces a form tall enough to scroll — contact,
   * delivery, the basket panel — and the browser keeps the scroll offset when
   * the form is swapped for something a third of its height, so without the
   * first line a customer who filled the form in and pressed the button at the
   * bottom of the page lands on a confirmation whose cake is a screen and a
   * half above them. Without `preventScroll`, the browser then scrolls the
   * *heading* to the top instead, which puts the cake back off-screen.
   *
   * This is also why there is no `aria-live` region here. Moving focus to the
   * heading announces it once; a live region over the same words announces it
   * twice.
   */
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, []);

  const href = plan?.href;
  const willRedirect = plan?.auto ?? false;

  useEffect(() => {
    if (!willRedirect || !href) return;

    const timer = window.setTimeout(() => router.replace(href), AUTO_TRACK_MS);
    const stop = () => {
      window.clearTimeout(timer);
      setAuto(false);
    };

    /* `pointerdown`/`keydown` rather than `click`: the intent to stay and read
       is expressed by touching the page at all, including a scroll. Capture, so
       a tap on the button stops the timer before the navigation it starts. */
    window.addEventListener("pointerdown", stop, { capture: true });
    window.addEventListener("keydown", stop, { capture: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", stop, { capture: true });
      window.removeEventListener("keydown", stop, { capture: true });
    };
  }, [willRedirect, href, router]);

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col items-center gap-5 pb-4 text-center sm:gap-7">
      <CakeBox />

      {/*
        Five beats, in reading order, staggered by `.s-placed` in globals.css:
        the tick, the headline, the reference, the button, the closing line.
        Every one of them sits at its finished state with no animation running,
        so a reduced-motion reader gets the same screen without choreography.
      */}
      <div className="s-placed flex w-full flex-col items-center gap-3 sm:gap-4">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-s-berry-wash text-s-berry sm:size-14">
          {/* The tick draws itself — `s-check` strokes the path on with
              `stroke-dashoffset`, the one property a path animates cheaply. */}
          <svg viewBox="0 0 24 24" className="size-6 sm:size-7" aria-hidden focusable="false">
            <path
              className="s-check"
              d="m5 12.5 4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </span>

        <h2
          ref={heading}
          tabIndex={-1}
          className="max-w-[18ch] text-[1.75rem] leading-[1.12] text-balance outline-none sm:max-w-none sm:text-[2.375rem]"
        >
          {many
            ? "Your cakes are officially on their way!"
            : "Your cake is officially on its way!"}
        </h2>

        {/*
          The reference the server minted, printed the way the bakery reads it
          down a phone line. Never assembled here: `refs` is what the order route
          returned, and app/api/orders is the only thing in the product that
          mints one.
        */}
        <div className="flex w-full flex-col items-center gap-2">
          {many ? (
            <ul className="flex w-full max-w-[26rem] flex-col gap-2">
              {refs.map((ref) => (
                <li
                  key={ref}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-s-sm bg-s-cream-deep/70 px-4 py-2.5"
                >
                  <span className="font-mono text-[1.0625rem] font-medium tracking-[0.08em]">
                    {ref}
                  </span>
                  <Link
                    href={`/orders/${ref}`}
                    className="text-[0.875rem] text-s-berry underline decoration-s-berry/40 underline-offset-4 hover:decoration-s-berry"
                  >
                    Track this order
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            /* The word and the reference are separate elements so that the
               reference is a text node of its own — quieter "Order", and a
               thing a test or a screen reader can take on its own rather than
               as half of a sentence. */
            <p className="font-mono text-[1.125rem] font-medium tracking-[0.08em] text-s-cocoa sm:text-[1.25rem]">
              <span className="font-sans text-[0.9375rem] font-normal tracking-normal text-s-bark">
                Order{" "}
              </span>
              <span>{refs[0]}</span>
            </p>
          )}
          <p className="max-w-[46ch] text-[0.9375rem] text-s-bark">
            Nothing has been charged. {formatINR(totalPaise)}{" "}
            is payable on delivery, and we&rsquo;ll call to confirm the details
            first.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-3 pt-1">
          {href && (
            /*
             * `replace`, for the automatic navigation's reason: pressing this
             * must not leave a confirmation behind for Back to return to. It
             * works from the first frame it is on screen — a real anchor to a
             * real page, not something the timer enables.
             */
            <Link
              href={href}
              replace
              className={sBtn("primary", "lg", "w-full max-w-[20rem]")}
            >
              Track your order
            </Link>
          )}
          <Link href="/shop" className={sBtn("ghost", "md")}>
            Keep shopping
          </Link>
        </div>

        {/* Not announced: the heading has already said the thing worth hearing,
            and a screen reader interrupting it to narrate a redirect is noise. */}
        <p
          className="flex min-h-6 items-center gap-2.5 text-[0.8125rem] text-s-bark"
          aria-hidden="true"
        >
          {auto ? (
            <>
              <span>Taking you to your order</span>
              <span className="relative block h-[3px] w-16 overflow-hidden rounded-full bg-s-line">
                <span className="s-redirect-bar absolute inset-0 origin-left rounded-full bg-s-berry" />
              </span>
            </>
          ) : (
            <span>
              Keep this reference — it is what the bakery looks an order up by.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * A cake box opening, drawn rather than loaded.
 *
 * One inline SVG and six keyframes in globals.css: no image to fetch, no
 * animation library, nothing that can still be downloading at the one moment in
 * the journey where somebody is waiting to be told it worked. Everything that
 * moves here moves on `transform` and `opacity`.
 *
 * Every element sits at its *finished* state in plain CSS — lid gone, cake
 * risen, sparkles spent — and the keyframes run only inside
 * `prefers-reduced-motion: no-preference`. So a reduced-motion reader sees an
 * open box with the cake standing in it, drawn the same way, with no motion.
 *
 * `aria-hidden`, because the headline beneath it says what this says.
 */
function CakeBox() {
  return (
    <svg
      viewBox="0 0 240 180"
      className="h-auto w-full max-w-[15rem] sm:max-w-[21rem]"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="mmc-placed-glow">
          <stop offset="0%" stopColor="var(--color-s-gold)" stopOpacity="0.52" />
          <stop offset="55%" stopColor="var(--color-s-gold)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--color-s-gold)" stopOpacity="0" />
        </radialGradient>
        {/* The box has a floor. Without it the cake, which starts a full box
            lower than it ends, hangs below one on the way up. */}
        <clipPath id="mmc-placed-box">
          <rect x="0" y="0" width="240" height="163" />
        </clipPath>
      </defs>

      <circle
        className="s-box-glow"
        cx="120"
        cy="102"
        r="96"
        fill="url(#mmc-placed-glow)"
      />

      <g className="s-box">
        {/* What the box is standing on. */}
        <ellipse cx="120" cy="164" rx="78" ry="5" fill="var(--color-s-line)" opacity="0.75" />

        {/* The inside, seen over the front panel — this is what makes it read
            as an open box rather than as a white plinth with a cake on it. */}
        <rect x="56" y="100" width="128" height="62" rx="4" fill="var(--color-s-cream-deep)" />

        <g clipPath="url(#mmc-placed-box)">
          {/*
            The cake. Drawn before the front panel so it rises out from behind
            it, and it never fully clears the box: the bottom of the base tier
            stays behind the panel, which is the difference between a cake in a
            box and a cake balanced on one.
          */}
          <g className="s-box-cake">
            {/* Base tier. */}
            <rect x="76" y="98" width="88" height="38" fill="#fdf0dd" />
            <ellipse cx="120" cy="98" rx="44" ry="6.5" fill="#fffaf2" />
            <path
              d="M76 101 q6 11 12 1 q6 12 12 1 q6 11 12 1 q6 12 12 1 q6 11 12 1 q6 12 12 1 q6 10 12 1 q3 5 4 1"
              fill="none"
              stroke="var(--color-s-berry)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Top tier, with the shadow it casts on the one below it. */}
            <ellipse cx="120" cy="98" rx="26" ry="4.5" fill="#f0dfc6" />
            <rect x="94" y="74" width="52" height="24" fill="#fff6ea" />
            <ellipse cx="120" cy="74" rx="26" ry="5" fill="#fffdf8" />
            {/* Three berries on the top, which is the only place a berry goes. */}
            <circle cx="110" cy="73" r="3.4" fill="var(--color-s-berry)" />
            <circle cx="120" cy="70.5" r="3.4" fill="var(--color-s-berry-deep)" />
            <circle cx="130" cy="73" r="3.4" fill="var(--color-s-berry)" />
          </g>
        </g>

        {/* The front of the box: the open rim, the wall, and the ribbon. */}
        <g>
          <rect
            x="52"
            y="110"
            width="136"
            height="52"
            rx="6"
            fill="var(--color-s-shell)"
            stroke="var(--color-s-line-strong)"
            strokeWidth="1.5"
          />
          <path
            d="M58 110.75 h124"
            stroke="var(--color-s-line-strong)"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.45"
          />
          <rect x="111" y="110" width="18" height="52" fill="var(--color-s-berry)" />
        </g>

        {/* The lid, which lifts, tips, and is gone. */}
        <g className="s-box-lid">
          <rect
            x="46"
            y="92"
            width="148"
            height="20"
            rx="6"
            fill="var(--color-s-shell)"
            stroke="var(--color-s-line-strong)"
            strokeWidth="1.5"
          />
          <rect x="111" y="92" width="18" height="20" fill="var(--color-s-berry)" />
          <path
            d="M120 93 C111 93 104 87 106 81 C109 76 117 81 120 93 Z"
            fill="var(--color-s-berry-deep)"
          />
          <path
            d="M120 93 C129 93 136 87 134 81 C131 76 123 81 120 93 Z"
            fill="var(--color-s-berry-deep)"
          />
          <circle cx="120" cy="92" r="3.6" fill="var(--color-s-berry)" />
        </g>

        {/* One candle, lit once the cake is up. Outside `s-box-cake` on
            purpose: it is not carried up out of the box, it is struck. */}
        <g className="s-box-candle">
          <rect x="118.25" y="56" width="3.5" height="19" rx="1.75" fill="var(--color-s-berry)" />
          <path d="M120 46 q4.5 5 0 10 q-4.5 -5 0 -10 Z" fill="var(--color-s-gold)" />
        </g>
      </g>

      {/*
        Four. Enough to read as "something good just happened" and few enough
        that it is not a confetti cannon — this is a bakery, not a casino.
      */}
      <g className="s-box-sparks">
        <g transform="translate(58 88)"><path className="s-box-spark" d={SPARK} /></g>
        <g transform="translate(182 76)"><path className="s-box-spark" d={SPARK} /></g>
        <g transform="translate(84 48)"><path className="s-box-spark" d={SPARK} /></g>
        <g transform="translate(160 42)"><path className="s-box-spark" d={SPARK} /></g>
      </g>
    </svg>
  );
}

/** A four-point sparkle, centred on its own origin so a `<g>` can place it. */
const SPARK = "M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6 Z";
