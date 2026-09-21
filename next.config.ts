import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // There are stray lockfiles above this directory; pin the workspace root.
  turbopack: {
    root: here,
  },
  // The 3D bundle is the whole cost centre — keep the imports tree-shaken so a
  // route chunk never pulls in the whole namespace.
  experimental: {
    optimizePackageImports: ["@react-three/drei", "three"],
  },
  /*
   * Response headers, and the reasoning for each one.
   *
   * These are the cheap half of §22. The expensive half — a real
   * Content-Security-Policy — is deliberately not here, and the reason is worth
   * writing down rather than leaving as an omission: Next injects inline
   * bootstrap scripts on every page and Clerk injects its own at runtime, so a
   * `script-src` worth having needs a per-request nonce threaded through the
   * proxy and into every inline script Next emits. Half of one, added blind,
   * either breaks sign-in or is written loose enough (`unsafe-inline`) to stop
   * being a defence while still looking like one. `frame-ancestors` is the part
   * that needs no nonce, so that part ships.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /* A response the browser may not second-guess the type of. Without
             it, an uploaded photo that a store served as text/plain could be
             sniffed back into script. */
          { key: "X-Content-Type-Options", value: "nosniff" },

          /* No clickjacking. An order page or an admin action behind a
             transparent iframe on somebody else's site is a real click the
             customer did not mean to make. `frame-ancestors` is the modern
             spelling and X-Frame-Options the one older browsers read; both,
             because they cost a line each. Nothing in this product is meant to
             be embedded. */
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },

          /* An order reference is in the path of /orders/MC-XXXXXX, and the
             page links out to the bakery. Send the origin and not the path, so
             a reference never arrives in a third party's access log. */
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          /* This is a cake shop. It has never asked for a camera, a microphone
             or a location, and saying so denies them to anything embedded too.
             `payment=()` is listed on purpose: no gateway exists yet, and when
             Razorpay arrives this line is the one to revisit first. */
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },

          /* Two years, subdomains included, no `preload`. Preloading is a
             one-way door baked into browser binaries — it commits every future
             subdomain to HTTPS forever — and is a decision for whoever owns the
             domain, not a default a config file should take on their behalf. */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
      {
        /* Nothing under /api is cacheable and one route (/api/me) answers with
           who you are. A shared cache holding that would hand one customer's
           role to the next. The route sets its own header; this is the floor
           under every sibling, including any added later. */
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },

  images: {
    /*
     * Catalogue photographs, uploaded from /admin and stored in Vercel Blob.
     *
     * next/image refuses a remote host it has not been told about, and the
     * refusal is quiet: the element renders nothing and the reason is logged
     * server-side only. So this entry is what makes every uploaded photo appear
     * at all, on the admin's own cards and on the customer's pickers alike.
     *
     * A wildcard subdomain because the hostname carries the store's id —
     * `<storeId>.public.blob.vercel-storage.com` — which differs between the
     * production store and any preview one, and hardcoding a single id would
     * mean a preview deployment whose images all silently vanish.
     *
     * Narrow in the three ways that matter: https only, one pathname prefix,
     * and a suffix that cannot match another tenant's bucket. `access: "public"`
     * in lib/storage is what puts them here; nothing private is served from
     * this host.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/catalog/**",
      },
    ],
  },
};

export default nextConfig;
