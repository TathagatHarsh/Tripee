"use client";

import { useEffect } from "react";
import { seedCatalog, useCatalogStore } from "@/lib/catalogStore";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";

/**
 * Puts the server's catalogue into the client store. Renders nothing.
 *
 * Two ways in, for two situations:
 *
 * **With a `snapshot`.** A Server Component already has the catalogue — the
 * builder's layout awaits it — so it hands it straight over, with no fetch and
 * no wait. The seeding happens *during render*, not in an effect, which is the
 * whole point: an effect runs after paint, so the first frame would price from
 * the shipped defaults and then visibly correct itself the moment the real
 * prices landed. It is rendered ahead of its siblings so the store is already
 * right when the pickers below it read it, on the server pass and the client
 * pass alike.
 *
 * **Without one.** For the rest of the site, where a client component needs
 * prices under no layout that fetched any. One request, once per page load.
 *
 * Seeding during render mutates a module-level store, which on the server is
 * shared between requests. That is deliberate and safe *here specifically*:
 * every request seeds the same catalogue, because the catalogue does not vary
 * by customer. Nothing per-customer may ever go in this store, for exactly
 * that reason.
 */
export function CatalogSync({ snapshot }: { snapshot?: CatalogSnapshot }) {
  if (snapshot) seedCatalog(snapshot);

  useEffect(() => {
    if (snapshot) return;
    // Already server-seeded by another CatalogSync on this page.
    if (useCatalogStore.getState().fromServer) return;

    let cancelled = false;
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: CatalogSnapshot | null) => {
        if (c && !cancelled) seedCatalog(c);
      })
      .catch(() => {
        // The store still holds the shipped catalogue, so the builder keeps
        // working at the prices this build was released with. Failing loudly
        // here would take down a page over a number that is probably right.
      });

    return () => { cancelled = true; };
  }, [snapshot]);

  return null;
}
