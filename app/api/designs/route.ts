import { getCatalogSnapshot } from "@/lib/catalogData";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { CakeConfig } from "@/lib/schema";
import { priceCake } from "@/lib/pricing";
import { makeSlug } from "@/lib/share";

/** Save a design and hand back a short URL somebody can forward. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ error: NO_DATABASE_MESSAGE }, { status: 503 });
  }

  const parsed = CakeConfig.safeParse((body as { config?: unknown })?.config);
  if (!parsed.success) {
    return Response.json({ error: "Invalid cake configuration" }, { status: 400 });
  }

  // Cached on the row so the gallery does not reprice every card it renders.
  // A later admin edit makes it stale, which is why /d/[slug] reprices on read
  // rather than trusting this.
  const price = priceCake(parsed.data, await getCatalogSnapshot());

  // Collisions are vanishingly unlikely at 31^7, but a saved design that
  // silently overwrote someone else's would be unforgivable.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = makeSlug();
    const existing = await db.design.findUnique({ where: { slug } });
    if (existing) continue;

    const design = await db.design.create({
      data: { slug, config: parsed.data, totalPaise: price.total },
    });
    return Response.json({ slug: design.slug, url: `/d/${design.slug}` }, { status: 201 });
  }

  return Response.json({ error: "Could not allocate a link. Try again." }, { status: 503 });
}
