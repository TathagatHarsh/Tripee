import { getCatalogSnapshot } from "@/lib/catalogData";
import { CakeConfig } from "@/lib/schema";
import { priceCake } from "@/lib/pricing";
import { validateCake } from "@/lib/rules";

/**
 * The authoritative price. The client runs the same function for the live
 * estimate, but this is the number that counts — and now for a second reason:
 * the client prices from a catalogue it fetched when the page loaded, and this
 * prices from the catalogue as it is at this moment.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = CakeConfig.safeParse((body as { config?: unknown })?.config);
  if (!parsed.success) {
    return Response.json({ error: "Invalid cake configuration" }, { status: 400 });
  }

  return Response.json({
    price: priceCake(parsed.data, await getCatalogSnapshot()),
    violations: validateCake(parsed.data),
  });
}
