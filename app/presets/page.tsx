import { permanentRedirect } from "next/navigation";

/**
 * The old catalogue, now the shop.
 *
 * `/presets` was the builder-era catalogue: twenty-one cards whose call to
 * action was "Order now", meaning *open this cake in the 3D builder*. The
 * builder is held back for this phase (see lib/flags), so that page's one
 * purpose no longer exists — and leaving it up would have given the storefront a
 * second, stale collection page, styled in the old editorial language, with a
 * button that leads to a Coming Soon screen.
 *
 * A permanent redirect rather than a deletion, because the address is real: it
 * is in search indexes, and it is the URL the previous landing page linked to
 * from three places. `/shop` is the same twenty-one cakes with filters, sorting
 * and a working add-to-cart, so this is a move rather than a loss.
 *
 * `permanentRedirect` (308) and not `redirect` (307): the catalogue is not
 * coming back to this address when the builder returns — the builder's own
 * entrance is `/build`, and `/shop` is where cakes are sold from now.
 *
 * Nothing else was removed. `components/PresetCard`, which this page used to
 * render, is still in the tree and still rendered by the shared-design page.
 */
export default function PresetsPage(): never {
  permanentRedirect("/shop");
}
