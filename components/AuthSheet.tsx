import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";
import Link from "next/link";

/**
 * Clerk's appearance type, taken from the component that consumes it rather
 * than by adding `@clerk/types` as a dependency of its own. It is a transitive
 * package, so importing it directly would mean depending on a version nothing
 * in this repository pins — and this derivation cannot drift from what
 * `<SignIn>` actually accepts, because it *is* what `<SignIn>` accepts.
 */
type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/**
 * The paper Clerk's forms are printed on.
 *
 * Clerk's own `<SignIn>` and `<SignUp>` are used rather than rebuilt against
 * the headless hooks, and the reason is not laziness about the markup. Those
 * components carry the flows nobody remembers to write: email verification,
 * password reset, bot protection, second factors, the "this email already has
 * an account, did you mean to sign in" fork. Reimplementing the shell and
 * quietly shipping none of that is the worse trade.
 *
 * What is ours is everything around and under it. The chipboard ground, the
 * raised sheet with a hairline edge, the letterhead, the line about not needing
 * an account — those are this bakery's, and the `appearance` below hands Clerk
 * the same palette, the same mono, and the same zero radius the rest of the
 * product is built from. Clerk's own card chrome is switched off entirely so
 * there is one sheet on screen rather than a card inside a card.
 */

/* §1.2 tokens, restated as literals: `appearance` is read by Clerk's own
   stylesheet, which is not inside this app's Tailwind theme and cannot see
   var(--color-*). Keep these in step with app/globals.css. */
const PAPER = "#e8e7e1";
const INK = "#22211e";
const INK_60 = "#535148";
const INK_15 = "#c2bcac";
const STAMP = "#a82f27";

export const clerkAppearance: Appearance = {
  variables: {
    /* Clerk 7's names, which are not Clerk 6's: colorText became
       colorForeground, colorInputBackground became colorInput, and so on. The
       `Appearance` type above catches a stale one at build time. */
    colorPrimary: INK,
    colorPrimaryForeground: PAPER,
    colorBackground: PAPER,
    colorForeground: INK,
    colorMutedForeground: INK_60,
    colorInput: PAPER,
    colorInputForeground: INK,
    colorBorder: INK_15,
    colorDanger: STAMP,
    colorNeutral: INK,
    /* §1.4: "Radii: 0 on everything." There is no exception for a third party. */
    borderRadius: "0",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    fontFamilyButtons: "var(--font-geist-mono), ui-monospace, monospace",
    fontSize: "0.9375rem",
  },
  elements: {
    /*
     * Deliberately thin. Tailwind classes handed to `appearance.elements` lose
     * the cascade to Clerk's own stylesheet, so everything structural — the
     * card chrome, the radii, the alignment, the field heights — lives in
     * app/globals.css under `.auth-sheet`, where a descendant selector wins.
     * What is left here is the handful of keys that map to properties Clerk
     * does not also set itself.
     */
    header: "hidden",
    footerActionText: "font-sans text-meta text-steel",
    footerActionLink: "font-mono text-micro uppercase tracking-[0.12em] text-ink",
    formFieldErrorText: "font-sans text-meta text-seal",
  },
};

/**
 * No Clerk instance attached. An operator's problem, said plainly rather than
 * thrown — `<SignIn>` would raise on the missing key and hand a visitor a 500
 * where the honest answer is that the shop is open and the door is not.
 */
function Unconfigured() {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-mono-lg leading-mono-lg tracking-mono-lg text-ink uppercase">
        Not switched on
      </p>
      <p className="font-sans text-body leading-relaxed text-steel">
        This deployment has no Clerk instance attached, so there is nothing to sign in to.
        Everything that doesn&apos;t need an account — the builder, the price, the docket,
        placing an order — works exactly as it does anywhere else.
      </p>
    </div>
  );
}

export function AuthSheet({
  title,
  lede,
  children,
}: {
  /** Printed on the letterhead rule, since Clerk's own header is switched off. */
  title: string;
  /** The sentence Clerk's hidden header would have carried, in our own voice. */
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-slab px-4 py-10 sm:py-16">
      <main id="main" className="mx-auto flex w-full max-w-[27rem] flex-col gap-4">
        <div className="paper-edge bg-paper">
          <div className="flex items-baseline justify-between gap-4 border-b border-rule px-6 py-4">
            <Link href="/" className="font-mono text-item font-medium tracking-[0.2em] uppercase">
              Makemycake
            </Link>
            {/*
              An <h1>, not a <span>. Clerk's own heading is hidden — the
              letterhead already says which bakery and which action — so if this
              were not a heading the page would have none, and a screen reader
              would land on a form with nothing naming it. Styled exactly as the
              span was: the semantics change, the pixels do not.
            */}
            <h1 className="font-mono text-micro tracking-[0.14em] text-steel uppercase">
              {title}
            </h1>
          </div>

          {/* `auth-sheet` is what app/globals.css hangs the Clerk overrides
              off. Scoped rather than global so none of it reaches the
              <UserButton> menu in the shopfront header. */}
          <div className="auth-sheet flex flex-col gap-5 px-6 py-6">
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
              <>
                <p className="font-sans text-body leading-relaxed text-steel">{lede}</p>
                {children}
              </>
            ) : (
              <Unconfigured />
            )}
          </div>
        </div>

        {/* The reassurance that belongs on this page and nowhere else. It sits
            outside the sheet because it is about the product, not the form. */}
        <p className="px-1 font-sans text-meta leading-relaxed text-steel">
          You don&apos;t need an account to build a cake or to order one.{" "}
          <Link href="/build/shape" className="border-b border-rule-strong text-ink hover:border-ink">
            Start building
          </Link>{" "}
          and we&apos;ll ring you to confirm, signed in or not.
        </p>
      </main>
    </div>
  );
}
