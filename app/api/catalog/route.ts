import { CATALOG_UNAVAILABLE_MESSAGE, tryCatalogSnapshot } from "@/lib/catalogData";

/**
 * The catalogue, for the browser.
 *
 * Public on purpose, and safe to be: every field here is already on screen the
 * moment somebody opens the builder — the names, the blurbs, the swatches, the
 * prices, and which options are currently offered. There is no customer data in
 * a CatalogSnapshot and nothing here the pickers do not render anyway.
 *
 * Pages under /build get their catalogue server-rendered through the layout, so
 * they never wait on this. It exists for the client components that sit under
 * no layout able to hand them one, and as the refresh path for a session left
 * open long enough for a price to have moved underneath it.
 *
 * No cache header: the underlying read is already tagged in lib/catalogData and
 * invalidated the moment an admin saves, so a max-age here would put a second,
 * dumber cache in front of a correct one.
 */
export async function GET() {
  const catalog = await tryCatalogSnapshot();
  if (!catalog) {
    return Response.json(
      { error: CATALOG_UNAVAILABLE_MESSAGE, code: "catalog_unavailable" },
      { status: 503 },
    );
  }
  return Response.json(catalog);
}
