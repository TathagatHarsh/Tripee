import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { AuthAutofill } from "@/components/AuthAutofill";

/**
 * Clerk's appearance type, taken from the component that consumes it rather
 * than by adding `@clerk/types` as a dependency of its own. It is a transitive
 * package, so importing it directly would mean depending on a version nothing
 * in this repository pins — and this derivation cannot drift from what
 * `<SignIn>` actually accepts, because it *is* what `<SignIn>` accepts.
 */
type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/**
 * The door into the shop.
 *
 * ## Why this stopped being a sheet of stationery
 *
 * This page used to wear the *builder's* palette — cool grey bond, mono
 * everywhere, radius 0 — inside a 27rem card centred on an otherwise empty
 * screen. That was a coherent choice when the product behind the login was a
 * working document. It is the wrong one now: the thing a customer is signing
 * in to is a cake shop, and every other page they have seen on the way here
 * (`/`, `/shop`, `/cakes/…`, `/cart`, `/checkout`, `/account`) is cream,
 * cocoa and berry in Instrument Serif. Landing on grey monospace read as
 * having been handed off to somebody else's software.
 *
 * So this is the storefront now, `.s-root` and all, and it is composed rather
 * than centred: the brand and a photograph of what is actually for sale take
 * the left half, the form takes the right. The photograph is the argument —
 * nobody creates an account for the account's sake.
 *
 * ## Why Clerk's own components are still inside it
 *
 * `<SignIn>` and `<SignUp>` carry the flows nobody remembers to write: email
 * verification, password reset, bot protection, second factors, the "this
 * email already has an account, did you mean to sign in" fork. Rebuilding the
 * shell against the headless hooks and quietly shipping none of that is the
 * worse trade, and it is not the trade this redesign needed to make — every
 * complaint about the old page was about the room, not the form.
 *
 * What is ours is everything around it, plus `appearance` and the `.s-auth`
 * block in app/globals.css, which hand Clerk this shop's palette, its radius
 * and its 48px controls.
 */

/* §s-palette, restated as literals: `appearance` is read by Clerk's own
   stylesheet, which is not inside this app's Tailwind theme and cannot see
   var(--color-s-*). Keep these in step with app/globals.css. */
const CREAM = "#fbf6ef";
const SHELL = "#ffffff";
const COCOA = "#3a2317";
const BARK = "#6b4a36";
const BERRY = "#b3123f";
const LINE_STRONG = "#d8c6b0";
const STOP = "#8e0e32";

/**
 * Clerk, in the shop's clothes, on the two pages that are nothing but Clerk.
 *
 * `options`, not `layout`. The key was renamed and the old name is not an
 * alias: `@clerk/ui` builds its `parsedOptions` by spreading `appearance.options`
 * over its defaults and never looks at `appearance.layout`, so an object under
 * the old name is silently dropped — no warning, no type error on a loose
 * object, just a "Development mode" ribbon that will not go away. The
 * `Appearance` type derived above is what catches this at build time, which is
 * the whole reason it is derived rather than hand-written.
 *
 * Three of the four keys below do work no stylesheet can do:
 *
 *   - `elevation: "flush"` turns Clerk's card chrome off at the source — its
 *     border, shadow, radius and outer padding — rather than unpicking it with
 *     descendant selectors afterwards. There is one surface on this page and
 *     it is ours.
 *   - `unsafe_disableDevelopmentModeWarnings` removes the "Development mode"
 *     ribbon. That badge is addressed to whoever is building this site and is
 *     shown to whoever is buying a cake, which is the wrong audience for it;
 *     it says nothing about the customer's account and nothing they can act
 *     on. It only ever renders against a development instance, so this changes
 *     nothing about production — it makes the page we can actually look at
 *     while designing it the same page a customer gets.
 *   - `socialButtonsPlacement: "top"` is Clerk's default and is named here so
 *     it stays that way: Google above the divider is the fast path, and the
 *     email field below it is the fallback.
 *
 * Nothing here suppresses Clerk's required attribution. `cl-footer` keeps its
 * "Secured by Clerk" line and the sign-in/sign-up switch it sits beside.
 */
export const authClerkAppearance: Appearance = {
  options: {
    elevation: "flush",
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    /* Clerk 7's names, which are not Clerk 6's: colorText became
       colorForeground, colorInputBackground became colorInput, and so on. The
       `Appearance` type above catches a stale one at build time. */
    colorPrimary: BERRY,
    colorPrimaryForeground: SHELL,
    colorBackground: CREAM,
    colorForeground: COCOA,
    colorMutedForeground: BARK,
    colorInput: SHELL,
    colorInputForeground: COCOA,
    colorBorder: LINE_STRONG,
    colorDanger: STOP,
    colorNeutral: COCOA,
    /* --radius-s-sm. */
    borderRadius: "0.625rem",
    fontFamily: "var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.9375rem",
  },
  elements: {
    /*
     * Deliberately thin. Tailwind classes handed to `appearance.elements` lose
     * the cascade to Clerk's own stylesheet, so everything structural — the
     * control heights, the divider, the labels, the footer — lives in
     * app/globals.css under `.s-auth`, where a descendant selector wins.
     *
     * The header is hidden because the column beside the form already says
     * which shop this is and which action is being taken, in this brand's own
     * face rather than Clerk's.
     */
    header: "hidden",
  },
};

/* The `s-` palette again, for the panel `/account/profile` renders. */
const S_SHELL = "#ffffff";
const S_COCOA = "#3a2317";
const S_BARK = "#6b4a36";
const S_BERRY = "#b3123f";
const S_LINE_STRONG = "#d8c6b0";
const S_STOP = "#8e0e32";

/**
 * The same treatment, for Clerk's `<UserProfile>` inside the account centre.
 *
 * A second object rather than one shared with the pages above, because the two
 * are different components in different rooms: `<UserProfile>` is a panel on a
 * page that already has a heading, a nav and a footer, and it sits on white
 * inside the account's own card. The sign-in pages are a whole screen with
 * nothing else on it. They agree on the palette, which is the part that
 * matters, and disagree on elevation and layout, which is the part that should
 * not be shared.
 */
export const shopClerkAppearance: Appearance = {
  variables: {
    colorPrimary: S_BERRY,
    colorPrimaryForeground: S_SHELL,
    colorBackground: S_SHELL,
    colorForeground: S_COCOA,
    colorMutedForeground: S_BARK,
    colorInput: S_SHELL,
    colorInputForeground: S_COCOA,
    colorBorder: S_LINE_STRONG,
    colorDanger: S_STOP,
    colorNeutral: S_COCOA,
    borderRadius: "0.625rem",
    fontFamily: "var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.9375rem",
  },
  elements: {
    header: "hidden",
    footerActionText: "text-[0.875rem] text-s-bark",
    footerActionLink: "text-[0.875rem] font-medium text-s-berry",
    formFieldErrorText: "text-[0.875rem] text-s-stop",
  },
};

/**
 * The wordmark, as it is drawn in the shop's own header.
 *
 * A copy of `components/shop/ShopHeader`'s private `CakeWordmark` rather than
 * an import, for one reason: this one is cream on a photograph at 28px, and the
 * header's is berry on cream at 24px. Exporting the other and parameterising it
 * would be one component with two call sites that never agree on anything but
 * the path data.
 */
function CakeWordmark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path d="M12 2.6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M4.5 20.4V12a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4.5 14.6c1.9 0 1.9 1.6 3.75 1.6s1.9-1.6 3.75-1.6 1.9 1.6 3.75 1.6 1.9-1.6 3.75-1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3 20.4h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The photograph, and the only thing on this page that is not a form.
 *
 * ## Why it is identical on both pages
 *
 * Signing in and creating an account are one decision seen from two sides, and
 * Clerk's footer switches between them with a link. If this column changed —
 * different cake, different line — that link would swap half the screen, which
 * is the "jarring full-page reload feeling" a mode switch must not have.
 * Holding it still means the switch reads as the right-hand column changing
 * its mind, which is what actually happened.
 *
 * ## Why this photograph
 *
 * `berry-forest` is the cake on the front page and the one in the site's Open
 * Graph card, so somebody arriving from a shared link meets the same cake
 * twice. It is a real photograph of a real thing this bakery sells — one of
 * the twenty-one renders `scripts/shoot-presets` makes from the catalogue's own
 * configurations — and it is committed to this repository, so there is no
 * external URL here to go missing.
 */
function BrandPanel() {
  return (
    <div className="relative isolate overflow-hidden bg-s-cocoa-deep lg:min-h-dvh">
      {/*
        `s-enter-media` settles the image from a 5% scale with no fade and no
        delay, which is the treatment the homepage hero gets and for the same
        reason: this is the LCP element on a cold visit, and an element
        animating up from `opacity: 0` is not painted until it is non-zero.
        Transform-only costs LCP nothing.
      */}
      <Image
        src="/presets/berry-forest.webp"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 46vw, 100vw"
        /*
          Two crops, because the frame is two different shapes.

          On a phone this is a 390x168 letterbox and on a laptop it is a
          660x900 portrait, and one object-position cannot serve both: centred,
          the letterbox cuts a band through the cake's plain white side and
          throws away the only part of the photograph that is doing any selling.
          30% puts the berries in the band. The tall frame keeps the whole cake.
        */
        className="s-enter-media object-cover object-[50%_30%] lg:object-[50%_50%]"
      />

      {/*
        Three stops, and both ends are load-bearing.

        The foot is what the headline sits on. The head is what the wordmark
        sits on — which on a phone is a 168px band cropped to the cake's berries,
        the brightest part of the photograph, so a thin scrim there is the
        difference between a wordmark and a suggestion of one. The middle is
        light, because a flat tint across the whole frame is how a photograph
        of food stops looking like food.
      */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-s-cocoa-deep/85 via-s-cocoa-deep/20 to-s-cocoa-deep/60"
      />

      {/*
        Three heights, because "stacked" covers three very different shapes.

        A phone gets a fixed 168px band: it is the only device where the form is
        genuinely tall relative to the screen, and a proportional band there
        would push sign-up's second field under the fold to buy nothing.

        Everything from 640px up gets 32vh instead, which is the fix for the
        portrait tablet — a fixed 208px band on a 1180px-tall screen left a
        400px form floating in 970px of cream, which is the composition this
        redesign is replacing, just in a nicer palette. A fraction of the
        viewport keeps the ratio honest at any height, and on a landscape phone
        (844x390) it correctly shrinks to 125px rather than eating a third of a
        short screen.

        Above 1024px none of it applies: the panel is a grid column and takes
        the full height of the row.
      */}
      <div className="relative flex h-full min-h-[10.5rem] flex-col justify-between gap-6 p-5 sm:min-h-[32vh] sm:p-7 lg:min-h-0 lg:p-10">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-s-sm text-s-cream transition-opacity duration-[var(--dur-ui)] hover:opacity-85"
        >
          <CakeWordmark className="size-6 shrink-0 sm:size-7" />
          <span className="font-display text-[1.375rem] leading-none tracking-[-0.01em] whitespace-nowrap sm:text-[1.5rem]">
            MakeYourCakes
          </span>
        </Link>

        {/* The sales argument, and it is only shown where there is room to read
            it. On a phone this column is a 168px band whose whole job is to say
            whose site this is — a headline in it would be a headline competing
            with the one above the form, 60px away. */}
        <div className="hidden flex-col gap-4 lg:flex">
          {/*
            Two lines, and the type scales so it stays two.

            There is no `max-w` here and there was: a character cap on this
            column squeezed the fact row below into two lines with a separator
            dot stranded at the end of the first, and a cap on the headline
            alone broke "yours." onto a third line of its own. The padding is
            the measure, and the size steps with the breakpoint that decides
            how wide this column is — 32px inside the 391px this has at the
            1024px where the split first appears, 44px by the time it has 626px.
          */}
          <p className="font-display text-[1.75rem] leading-[1.06] tracking-[-0.02em] text-s-cream lg:text-[2rem] xl:text-[2.5rem] 2xl:text-[2.75rem]">
            Every cake here is
            <span className="block text-s-cream/80 italic">baked the day it&rsquo;s yours.</span>
          </p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[0.6875rem] tracking-[0.12em] text-s-cream/75 uppercase">
            <li>Eggless</li>
            <li aria-hidden className="size-1 rounded-full bg-s-cream/35" />
            <li>Jubilee Hills</li>
            <li aria-hidden className="size-1 rounded-full bg-s-cream/35" />
            <li>Pay after we confirm</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * No Clerk instance attached. An operator's problem, said plainly rather than
 * thrown — `<SignIn>` would raise on the missing key and hand a visitor a 500
 * where the honest answer is that the shop is open and the door is not.
 */
function Unconfigured() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-[1.375rem] leading-tight">Sign-in isn&rsquo;t switched on</h2>
      <p className="text-[0.9375rem] leading-relaxed text-s-bark">
        This deployment has no account system attached, so there is nothing to sign in to.
        Everything that never needed an account — browsing the cakes, the price, placing an
        order — works exactly as it does anywhere else.
      </p>
      <Link href="/shop" className="mt-1 w-fit font-medium text-s-berry underline underline-offset-4">
        Browse the cakes
      </Link>
    </div>
  );
}

export function AuthSheet({
  title,
  lede,
  children,
}: {
  /** The page's own `<h1>`, in this brand's voice — Clerk's is switched off. */
  title: string;
  /** One sentence on what an account is for. Not a requirement, a benefit. */
  lede: string;
  children: React.ReactNode;
}) {
  return (
    /*
      `s-root` is the storefront's fence — the `s-` tokens, the serif headings,
      the berry focus ring and every `.s-*` animation live behind it. Putting it
      on this page is the whole redesign in one class name.

      The grid is asymmetric on purpose: 46/54 rather than half and half, so the
      form column is the wider one. The photograph is the reason somebody wants
      an account; the form is what they came here to do.
    */
    <div className="s-root flex min-h-dvh flex-col bg-s-cream lg:grid lg:grid-cols-[46fr_54fr]">
      <BrandPanel />

      {/*
        `flex-1` is what stops the stacked layout pooling empty cream under the
        form. Without it `<main>` is only as tall as its content, so on an
        820x1180 tablet the form ended a third of the way down and the remaining
        500px was nothing at all — the exact "plain form floating on a huge
        blank background" this redesign exists to remove. Growing into the
        leftover height means `justify-center` has something to centre in.

        It cannot clip: `flex-1` sets the basis, not the height, so a form
        taller than the space left — sign-up on a small phone, or any
        verification step — simply makes the page scroll as it did before.
      */}
      <main
        id="main"
        className="flex flex-1 flex-col justify-center px-5 py-9 sm:px-8 sm:py-12 lg:px-12 lg:py-10 xl:px-20"
      >
        {/* `s-enter` stages the direct children — heading block, form, guest
            line — at 70ms apart. It is the homepage hero's entrance, reused
            rather than reinvented, and like everything else in that block it
            is inside `prefers-reduced-motion: no-preference` and disappears
            entirely when motion is turned down. */}
        <div className="s-enter mx-auto flex w-full max-w-[25rem] flex-col gap-7">
          <div className="flex flex-col gap-2.5">
            <h1 className="font-display text-[2.125rem] leading-[1.08] tracking-[-0.02em] sm:text-[2.5rem]">
              {title}
            </h1>
            <p className="text-[0.9375rem] leading-relaxed text-s-bark">{lede}</p>
          </div>

          {/*
            `auth-sheet` carries the rules both Clerk surfaces in this app share
            — header off, left alignment, no gradients on the controls.
            `s-auth` carries the ones only these two pages want: 52px controls,
            a full-width Google button, the divider, and a footer that reads as
            a sentence rather than a form field. Two classes rather than one
            because `/account/profile` wears the first and must not inherit the
            second.
          */}
          <div className="auth-sheet s-auth">
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
              <>
                {children}
                {/* Fills in the `autocomplete` Clerk's inputs ship without, so a
                    password manager can offer a saved address and a phone can
                    fill a verification code from the message it arrived in. It
                    renders nothing; see the file for why this is done to the
                    DOM and not through `appearance`. Inside the key check
                    because with no Clerk there is no form to annotate. */}
                <AuthAutofill />
              </>
            ) : (
              <Unconfigured />
            )}
          </div>

          {/*
            The most important sentence on the page, and the reason it is below
            the form rather than inside it: an account is optional in this
            product and always has been. Anything that implies otherwise is a
            checkout this shop just lost.
          */}
          <p className="border-t border-s-line pt-5 text-[0.875rem] leading-relaxed text-s-bark">
            You don&rsquo;t need an account to order a cake.{" "}
            {/* The shop, not the builder: /build is a Coming Soon page for this
                phase — see lib/flags. */}
            <Link
              href="/shop"
              className="font-medium text-s-berry underline decoration-s-berry/30 underline-offset-4 transition-colors duration-[var(--dur-ui)] hover:decoration-s-berry"
            >
              Pick one
            </Link>{" "}
            and we&rsquo;ll ring you to confirm, signed in or not.
          </p>
        </div>
      </main>
    </div>
  );
}
