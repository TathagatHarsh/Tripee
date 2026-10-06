import { z } from "zod";
import { callerKey, crossSite, rateLimit, tooMany } from "@/lib/apiGuard";
import { isCovered } from "@/lib/coverage";

const Point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Whether any bakery delivers to this pin, for the checkout location sheet.
 * Only a yes or no leaves the server: bakery names and locations do not.
 */
export async function POST(req: Request) {
  if (crossSite(req))
    return Response.json({ error: "Not authorised" }, { status: 403 });
  const limit = rateLimit("serviceability", callerKey(req), {
    max: 60,
    windowSeconds: 60,
  });
  if (!limit.ok) return tooMany(limit, "location checks");
  const point = Point.safeParse(await req.json().catch(() => null));
  if (!point.success)
    return Response.json({ error: "Enter valid coordinates" }, { status: 400 });
  return Response.json({ covered: await isCovered(point.data) });
}
