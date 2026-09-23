import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { CatalogSync } from "@/components/CatalogSync";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-brand-display", display: "swap" });
const body = Manrope({ subsets: ["latin"], variable: "--font-brand-body", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://makeyourcakes.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "MakeYourCakes",
  title: "MakeYourCakes · cakes baked to order in Hyderabad",
  description:
    "Eggless cakes baked to order in Jubilee Hills and delivered across Hyderabad. Itemised pricing, and no payment until we have confirmed your order by phone.",
  openGraph: {
    title: "MakeYourCakes",
    siteName: "MakeYourCakes",
    description: "Cakes baked to order in Jubilee Hills, Hyderabad.",
    type: "website",
  },
};

export const viewport: Viewport = {
  /* The storefront's cream (--color-s-cream), which is what a phone's browser
     chrome sits above on every customer page now. Was #E8E7E1, the builder's
     cool paper, which is still the ground under /build and the order pages. */
  themeColor: "#FAF7EF",
  /* This product is light-only on purpose, so it has to say so. Renders
     <meta name="color-scheme" content="only light">, which keeps the builder's
     scrollbar and Chrome's autofill highlight on paper when the OS asks for
     dark. `only light`, not `light`: plain `light` says the page supports a
     light rendering, which still lets Chrome's Auto Dark Theme on Android
     invert the paper. `only` is the opt-out. Not a dark theme — a declaration
     that there isn't one. */
  colorScheme: "only light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Clerk's context, but only when there is a Clerk instance to point it at.
 *
 * `<ClerkProvider>` throws on a missing publishable key, and it wraps the whole
 * application — so on a deployment with no keys it would take down the
 * shopfront and the builder along with the two staff portals. lib/db.ts has
 * always held the opposite line, that a deployment missing a dependency should
 * still let somebody design a cake; proxy.ts holds it for the routes and this
 * holds it for the tree. The staff areas still fail closed, in proxy.ts, with a
 * 503 that names the variable to set.
 */
function Identity({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${display.variable} ${body.variable}`}
    >
      {/* bg-slab was chipboard, which is the desk. The page itself is the top
          copy — §1.2 --paper. The desk only shows where a sheet is lying on it. */}
      <body className="min-h-dvh bg-paper text-ink antialiased">
        {/*
         * Inside <body>, not wrapping <html>, which is what Clerk 7 requires.
         *
         * It renders no markup of its own and adds nothing to a guest's page —
         * no session, no fetch, no layout shift. What it provides is the context
         * that <SignIn>, <SignUp> and <SignOutButton> need, and those live on
         * four screens: sign-in, sign-up, the account page and the two staff
         * headers. The builder never reaches for any of it.
         */}
        <Identity>
        {/*
         * Every page puts a header and, in the builder, a nine-step chip rail
         * ahead of the content, which is a long walk on a keyboard and a longer
         * one on a screen reader. Parked above the top edge and slid down on
         * focus, so it prints itself in the top-left like any other line on this
         * paper. Positioned rather than `sr-only focus:not-sr-only` — that pair
         * left it 1x1 and absolute even while focused, because sr-only's own
         * position won the cascade.
         */}
        <a
          href="#main"
          className="fixed left-4 -top-20 z-[100] inline-flex min-h-11 items-center border border-ink bg-paper px-4 font-mono text-meta text-ink focus:top-4"
        >
          Skip to content
        </a>
        {/*
          * Prices for every client component that is not under /build.
          *
          * The presets, the lab and the shared-design pages all show a total,
          * and none of them sits under a layout that fetches a catalogue. This
          * fetches one after mount; until it lands they show the prices this
          * build shipped with, which is the right thing to be showing while
          * waiting.
          *
          * Under /build it costs nothing: that layout seeds the store during
          * render, and CatalogSync skips its fetch when the store is already
          * server-seeded.
          */}
        <CatalogSync />
        {children}
        </Identity>
      </body>
    </html>
  );
}
