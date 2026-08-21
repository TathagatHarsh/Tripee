import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif, Martian_Mono } from "next/font/google";
import "./globals.css";

// Display only, title and up. One weight, one italic — the italic is the second
// half of a headline, and it is the whole of the typographic hierarchy above
// 26px. A variable-width grotesque needed a wdth axis and a 600 cut to look
// deliberate at all; this needs neither.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

// Everything a customer reads to make a decision. 400 and 500, with 600 for
// group headings and nothing above it.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

// Martian Mono over JetBrains Mono deliberately — it reads as a receipt rather
// than as code. Two weights ship: 400 for docket lines, 700 for a total.
const martian = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian",
  display: "swap",
  weight: ["400", "700"],
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
  themeColor: "#E9E7E2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${instrumentSerif.variable} ${instrumentSans.variable} ${martian.variable}`}
    >
      <body className="min-h-dvh bg-slab text-ink antialiased">{children}</body>
    </html>
  );
}
