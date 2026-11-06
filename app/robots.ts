import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://makeyourcakes.com").replace(/\/+$/, "");

/**
 * /robots.txt. The shop is open to search engines; the staff portals, a
 * customer's own pages, the API and the unfinished or experimental routes
 * (/build, /lab, /film) are not. This is a crawl hint, not access control —
 * every one of those routes guards itself.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin", "/kitchen", "/vendor", "/account", "/orders", "/checkout", "/cart",
        "/api/", "/sign-in", "/sign-up", "/post-sign-in",
        "/build", "/lab", "/film", "/d/", "/presets",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
