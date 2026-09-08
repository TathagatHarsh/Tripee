"use client";

import { create } from "zustand";
import { DEFAULT_SNAPSHOT } from "./catalogDefaults";
import type { CatalogSnapshot } from "./catalogSnapshot";

/**
 * The catalogue the browser is currently pricing against.
 *
 * Seeded synchronously with what the product shipped with, so the first frame
 * is never empty and never a loading state: a builder that cannot show a price
 * until a fetch returns is worse than one showing a price a few hundred
 * milliseconds behind. components/CatalogSync then replaces it with the
 * server's answer, and under /build that happens during the first render rather
 * than after it — see that file.
 *
 * Not persisted, unlike lib/store's cake. A design is the customer's and should
 * survive a reload; the catalogue is the bakery's, and a copy cached in
 * sessionStorage is a stale price with a long memory.
 *
 * Never read by lib/pricing. The engine takes its catalogue as an argument
 * precisely so no server path can end up reading this store — components read
 * it and pass down what they get.
 */

interface CatalogState {
  catalog: CatalogSnapshot;
  /** False until a server snapshot has arrived — the prices are shipped ones. */
  fromServer: boolean;
  seed: (c: CatalogSnapshot) => void;
}

export const useCatalogStore = create<CatalogState>()((set) => ({
  catalog: DEFAULT_SNAPSHOT,
  fromServer: false,
  seed: (catalog) => set({ catalog, fromServer: true }),
}));

/** The catalogue, reactively. What every picker and price badge reads. */
export const useCatalog = (): CatalogSnapshot => useCatalogStore((s) => s.catalog);

/**
 * Seed outside React's lifecycle.
 *
 * Used by CatalogSync during render rather than in an effect, so server markup
 * and the first client render agree on the same prices. Idempotent by
 * reference: re-seeding the snapshot already held is a no-op, which keeps it
 * safe to call on every render pass.
 */
export function seedCatalog(catalog: CatalogSnapshot): void {
  if (useCatalogStore.getState().catalog === catalog) return;
  useCatalogStore.getState().seed(catalog);
}
