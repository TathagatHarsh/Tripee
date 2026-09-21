import Image from "next/image";
import Link from "next/link";
import { BUILDER_ENABLED } from "@/lib/flags";
import { sBtn } from "@/lib/shopUi";

/**
 * The 3D Cake Builder, presented as the upcoming feature it currently is.
 *
 * ## What this is not
 *
 * It is not a replacement for the builder and it does not reach into it. The
 * real builder — nine steps, a live WebGL cake, `components/three/*`,
 * `components/builder/*`, `app/build/*` — is intact, unmodified and still in the
 * tree. Nothing here imports any of it, which is also why this card costs a
 * shopper no Three.js: the visual is one of the photographs the catalogue was
 * already shipping, not a canvas.
 *
 * It is also not the abandoned `app/build-legacy`, `components/builder-legacy`
 * or `components/docket-legacy` trees. Nothing in this phase touches those.
 *
 * ## Why the button is a real disabled button
 *
 * The brief is that a customer must not be able to enter the unfinished
 * experience. So the control is a `<button disabled>` and not a styled `<div>`,
 * and not a `<Link>` with its href removed: a disabled button is announced as
 * "Coming soon, dimmed button" and is skipped by Tab, whereas an anchor with no
 * href is text that a keyboard still lands on and a screen reader still calls a
 * link. The one that *looks* disabled and the one that *is* are different
 * components, and this is the second.
 *
 * The gate that actually enforces it is not here — it is app/build/layout.tsx,
 * which every one of the nine steps renders inside. This card could be deleted
 * and the builder would still be shut. See lib/flags.
 *
 * ## Turning it back on
 *
 * `NEXT_PUBLIC_BUILDER_ENABLED=true` flips the same constant the route gate
 * reads, and this card becomes a live link to `/build/shape` with no code
 * change. One flag, one behaviour, in two places that cannot disagree.
 */
export function BuilderComingSoon({ className = "" }: { className?: string }) {
  return (
    <section
      aria-labelledby="builder-soon"
      className={
        "relative isolate overflow-hidden rounded-s bg-s-cocoa-deep text-s-cream " +
        className
      }
    >
      {/*
        The photograph, as a ground rather than as a picture. It is the existing
        `death-by-chocolate` catalogue shot — a real render of a real
        configuration — dimmed behind the copy, so the section reads as being
        *about* cake without pretending to show a feature that is not finished.

        `aria-hidden` on the wrapper and an empty alt: it carries no information
        the heading does not, and "Death by Chocolate" announced in the middle of
        a section about a builder would be a non sequitur.
      */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image
          src="/presets/death-by-chocolate.webp"
          alt=""
          fill
          sizes="100vw"
          /* `s-parallax` is a native view() timeline in globals.css: 4.4% of
             vertical travel on transform only, so it cannot shift layout and
             costs one compositor property. The photograph is decorative here
             (aria-hidden above), which is exactly the kind of element that may
             move without anybody needing to read it mid-flight. */
          className="s-parallax object-cover object-[50%_58%] opacity-55"
        />
        {/* The copy column needs 4.5:1 and the right third needs to still look
            like cake, so the wash is a horizontal ramp rather than a flat fill:
            opaque where the words are, nearly clear where the photograph is the
            only thing on it. */}
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(42,24,15,0.95)_0%,rgba(42,24,15,0.82)_42%,rgba(42,24,15,0.25)_100%)]" />
      </div>

      <div className="flex max-w-[40rem] flex-col items-start gap-5 px-6 py-14 sm:px-10 sm:py-20 lg:px-14 lg:py-24">
        {/*
          The full phrase lives in the heading rather than being split between a
          badge and a title. A gold pill reading "Coming soon" above a headline
          reading "3D Cake Builder" says the same thing to a sighted reader, but
          it is two strings — so it is not what a screen reader announces for
          this section's label, and it is not what a test can assert on. The
          brief asks for one phrase; this is that phrase, once.

          "Coming Soon" is `--color-s-gold`, which globals.css marks as a badge
          fill and never text. That note is measured against cream, where it is
          2.6:1. This panel is cocoa-deep under a 95%-opaque wash, where the same
          gold measures about 10.6:1 — it is light-on-dark here, which is the
          opposite pairing.
        */}
        <h2 id="builder-soon" className="text-[2rem] leading-[1.06] sm:text-[2.75rem]">
          3D Cake Builder{" "}
          <span className="whitespace-nowrap text-s-gold">— Coming Soon</span>
        </h2>

        <p className="max-w-[42ch] text-[1.0625rem] leading-relaxed text-s-cream/80">
          Design your dream cake in 3D: shape, sponge, filling, frosting and
          what lands on top, priced as you go. We&rsquo;re putting the finishing
          touches on it.
        </p>

        {BUILDER_ENABLED ? (
          <Link href="/build/shape" className={sBtn("primary", "lg")}>
            Start building
          </Link>
        ) : (
          <button
            type="button"
            disabled
            /* Not `sBtn`'s disabled dress: that is tuned for cream, and this
               panel is cocoa — `bg-s-cream-deep` on it would read as an enabled
               pale button. A dimmed outline on a dark ground is the one that
               reads as "not yet" at 4.6:1. */
            className={
              "inline-flex min-h-14 cursor-not-allowed items-center justify-center gap-2 " +
              "rounded-s-sm border border-s-cream/25 px-7 text-[1.0625rem] " +
              "font-medium text-s-cream/60"
            }
          >
            Coming soon
          </button>
        )}

        <p className="text-[0.875rem] text-s-cream/55">
          Until then, every cake on the shop is made to order. Pick one and tell
          us what it should say.
        </p>
      </div>
    </section>
  );
}
