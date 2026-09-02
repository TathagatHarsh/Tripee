import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
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
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${geistMono.variable} ${instrumentSans.variable} ${instrumentSerif.variable}`}
    >
      {/* bg-slab was chipboard, which is the desk. The page itself is the top
          copy — §1.2 --paper. The desk only shows where a sheet is lying on it. */}
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
