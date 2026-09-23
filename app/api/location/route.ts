import { z } from "zod";
import { callerKey, crossSite, rateLimit, tooMany } from "@/lib/apiGuard";
import { getCoordinatesFromAddress } from "@/lib/mapping";
const Query = z.union([
  z.string().trim().min(3).max(300),
  z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
]);
export async function POST(req: Request) {
  if (crossSite(req))
    return Response.json({ error: "Not authorised" }, { status: 403 });
  const limit = rateLimit("geocoding", callerKey(req), {
    max: 15,
    windowSeconds: 60,
  });
  if (!limit.ok) return tooMany(limit, "location searches");
  const query = Query.safeParse(await req.json().catch(() => null));
  if (!query.success)
    return Response.json(
      { error: "Enter a valid address or coordinates" },
      { status: 400 },
    );
  try {
    return Response.json({
      results: await getCoordinatesFromAddress(query.data),
    });
  } catch {
    return Response.json(
      {
        error:
          "Address search unavailable. Select your pin and enter the address manually.",
      },
      { status: 503 },
    );
  }
}
