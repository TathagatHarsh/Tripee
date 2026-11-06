import type { MetadataRoute } from "next";
import { listCakes } from "@/lib/cakeData";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://makeyourcakes.com").replace(/\/+$/, "");

/** Rebuilt hourly, so a cake added in /admin reaches the sitemap without a deploy. */
export const revalidate = 3600;

const PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/shop", priority: 0.9 },
  { path: "/custom-cakes", priority: 0.8 },
  { path: "/contact", priority: 0.5 },
  { path: "/shipping-policy", priority: 0.3 },
  { path: "/refund-policy", priority: 0.3 },
  { path: "/terms", priority: 0.2 },
  { path: "/privacy", priority: 0.2 },
];

/** /sitemap.xml: the shop's public pages and every cake on sale. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cakes = await listCakes();
  return [
    ...PAGES.map(({ path, priority }) => ({ url: `${SITE_URL}${path === "/" ? "" : path}`, priority })),
    ...cakes.map((c) => ({ url: `${SITE_URL}/cakes/${c.slug}`, priority: 0.7 })),
  ];
}
