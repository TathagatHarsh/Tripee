import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import { CatalogSync } from "@/components/CatalogSync";
import "./globals.css";

/*
 * §1.1: "Two faces. No third. No bold anywhere in the product."
 *
 * Geist Mono carries everything — every headline, all ticket content, every
 * label, every number. Monospace is the voice of duplicate stationery, and mono
 * is inherently tabular, which is why prices align here without
 * font-variant-numeric.
 *
 * 400 and 500 only. §1.1 calls this a hard rule and gives the reason: emphasis in
 * this system comes from case, colour, rule, box and stamp. A document does not
 * get bold; it gets underlined, boxed, or stamped.
 *
 * This replaces Martian Mono and keeps --font-mono pointing at it, so every
 * existing `font-mono` call site picks the new face up untouched. Martian shipped
 * a 700 for totals, which is precisely the weight §1.1 bans.
 */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  weight: ["400", "500"],
});

/*
 * The prose face, and a placeholder.
 *
 * §1.1 specifies Switzer (Fontshare) for "anything longer than one line" — option
 * descriptions, paragraphs, error explanations. Switzer is not on Google Fonts, so
 * it needs woff2 files in the repo and next/font/local; until those land,
 * Instrument Sans stands in. It is the same kind of face doing the same job — a
 * neo-grotesque beside the machine voice — and it is capped at the same 400/500,
 * so nothing downstream changes when Switzer replaces it.
 *
 * §1.1 makes this the *smaller* half of the system: prose under six words should
 * have been mono.
 */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
  weight: ["400", "500"],
});

/*
 * The landing page's display face, and only the landing page's.
 *
 * §1.1 bans a display serif inside the product, and every screen under /build,
 * /presets and /d still obeys that — their headings are mono. The shopfront is
 * the one surface that was designed around this face, and stripping it turned
 * "Custom cake. Designed by you." into an uppercase mono slab that read as a
 * system message rather than a headline. It is scoped to `.home` in globals.css
 * so it cannot leak back into the product.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Makemycake — build your cake and watch it appear",
  description:
    "Design a cake in 3D, see the price itemised as you build, and get an order docket a real bakery can work from. Hyderabad.",
  openGraph: {
    title: "Makemycake",
    description: "Build your own cake in 3D. Itemised pricing, no surprises.",
    type: "website",
  },
};

export const viewport: Viewport = {
  /* §1.2 --paper, the top copy. Was #E9E7E2, which was the old --color-slab. */
  themeColor: "#E8E7E1",
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
      className={`${geistMono.variable} ${instrumentSans.variable} ${instrumentSerif.variable}`}
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
