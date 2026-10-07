import "server-only";
import { z } from "zod";
import { haversine, type Point, type RouteEstimate } from "./assignmentRules";
import { HYDERABAD_BBOX, inHyderabad, olaToAddress, photonToAddress, type LocatedAddress, type OlaPlace, type PhotonFeature } from "./location";

export interface GeocodingProvider {
  search(query: string | Point): Promise<LocatedAddress[]>;
}
export interface RoutingProvider {
  matrix(
    origins: Point[],
    destination: Point,
  ): Promise<(RouteEstimate | null)[]>;
}
const place = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  display_name: z.string(),
  place_id: z.union([z.string(), z.number()]),
  address: z.record(z.string(), z.string()),
});
async function json(url: URL) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: {
      "User-Agent": process.env.GEOCODING_USER_AGENT ?? "MakeYourCakes/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Mapping service returned ${response.status}`);
  return response.json();
}
// Configure a hosted or self-hosted Nominatim-compatible endpoint. No public
// Nominatim default: customer addresses must not silently go to its public demo.
export const nominatim: GeocodingProvider = {
  async search(query) {
    const base = process.env.GEOCODING_URL;
    if (!base)
      throw new Error(
        "Address search is not configured. Choose a map pin and enter your address.",
      );
    const url = new URL(
      typeof query === "string" ? "search" : "reverse",
      base.endsWith("/") ? base : `${base}/`,
    );
    url.search = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      ...(typeof query === "string"
        ? { q: query, countrycodes: "in", limit: "5" }
        : { lat: String(query.lat), lon: String(query.lng) }),
    }).toString();
    const data = await json(url);
    return z
      .array(place)
      .parse(Array.isArray(data) ? data : [data])
      .filter((p) => p.address.country_code === "in")
      .map((p) => ({
        lat: p.lat,
        lng: p.lon,
        address: p.display_name,
        placeId: String(p.place_id),
        city: p.address.city ?? p.address.town ?? p.address.county ?? "",
        state: p.address.state ?? "",
        pincode: p.address.postcode ?? "",
        locality: p.address.suburb ?? "",
      }));
  },
};
/**
 * Photon (komoot), free and built for search-as-you-type, which public
 * Nominatim forbids. The prototype's default; `PHOTON_URL` points it at a
 * self-hosted instance, and a paid provider replaces it via `geocoder()`.
 */
export const photon: GeocodingProvider = {
  async search(query) {
    const base = process.env.PHOTON_URL || "https://photon.komoot.io";
    const url = new URL(
      typeof query === "string" ? "api" : "reverse",
      base.endsWith("/") ? base : `${base}/`,
    );
    url.search = new URLSearchParams(
      typeof query === "string"
        ? { q: query, lat: "17.385", lon: "78.4867", bbox: HYDERABAD_BBOX.join(","), limit: "5" }
        : { lat: String(query.lat), lon: String(query.lng), limit: "1" },
    ).toString();
    const data = (await json(url)) as { features?: PhotonFeature[] };
    const kind = typeof query === "string" ? "search" : "reverse";
    return (data.features ?? [])
      .map((f) => photonToAddress(f, kind))
      .filter((a): a is LocatedAddress => a !== null);
  },
};

/** An Ola Maps request, signed with the server's key. */
function olaUrl(path: string, params: Record<string, string>) {
  const url = new URL(path, "https://api.olamaps.io/");
  url.search = new URLSearchParams({ ...params, api_key: process.env.OLA_MAPS_API_KEY ?? "" }).toString();
  return url;
}
/**
 * Ola Maps: suggestions held to Hyderabad as Photon's are, and pin lookups.
 * Ola bounds by a circle; 40 km from the centre reaches the box's corners, and
 * the box itself trims what the circle lets in.
 */
export const ola: GeocodingProvider = {
  async search(query) {
    const kind = typeof query === "string" ? "search" : "reverse";
    const data = (await json(
      typeof query === "string"
        ? olaUrl("places/v1/autocomplete", { input: query, location: "17.385,78.4867", radius: "40000", strictbounds: "true" })
        : olaUrl("places/v1/reverse-geocode", { latlng: `${query.lat},${query.lng}` }),
    )) as { predictions?: OlaPlace[]; results?: OlaPlace[] };
    return (data.predictions ?? data.results ?? [])
      .map((r) => olaToAddress(r, kind))
      .filter((a): a is LocatedAddress => a !== null && (kind === "reverse" || inHyderabad(a)))
      .slice(0, 5);
  },
};

/** Ola once its key is set, else Nominatim when configured, else Photon. */
export function geocoder(): GeocodingProvider {
  return process.env.OLA_MAPS_API_KEY ? ola : process.env.GEOCODING_URL ? nominatim : photon;
}

export const osrm: RoutingProvider = {
  async matrix(origins, destination) {
    if (!origins.length) return [];
    const base =
      process.env.ROUTING_URL ??
      (process.env.NODE_ENV === "production"
        ? ""
        : "https://router.project-osrm.org");
    if (!base) throw new Error("Routing provider unavailable");
    const points = [...origins, destination]
      .map((p) => `${p.lng},${p.lat}`)
      .join(";");
    const url = new URL(
      `${base.replace(/\/$/, "")}/table/v1/driving/${points}`,
    );
    url.search = new URLSearchParams({
      sources: origins.map((_, i) => i).join(";"),
      destinations: String(origins.length),
      annotations: "distance,duration",
    }).toString();
    const result = z
      .object({
        code: z.literal("Ok"),
        distances: z.array(z.array(z.number().nonnegative().nullable())),
        durations: z.array(z.array(z.number().nonnegative().nullable())),
      })
      .parse(await json(url));
    if (
      result.distances.length !== origins.length ||
      result.durations.length !== origins.length
    )
      throw new Error("Invalid route matrix");
    return origins.map((_, i) => {
      const distance = result.distances[i]?.[0],
        duration = result.durations[i]?.[0];
      return distance == null || duration == null
        ? null
        : {
            distanceKm: distance / 1000,
            estimatedMinutes: duration / 60,
            source: "osrm",
          };
    });
  },
};
/**
 * Road distance and ETA with traffic. Up to 50 pairs a request. Ola documents
 * no "no route" answer, only failed pairs (INTERNAL_SERVER_ERROR), so any pair
 * that is not OK fails the batch into the marked Haversine fallback, as an OSRM
 * error does, rather than counting the bakery as unreachable.
 */
export const olaRouting: RoutingProvider = {
  async matrix(origins, destination) {
    if (!origins.length) return [];
    const result = z
      .object({
        rows: z.array(
          z.object({
            elements: z.array(
              z.object({
                status: z.literal("OK"),
                distance: z.number().nonnegative(),
                duration: z.number().nonnegative(),
              }),
            ).min(1),
          }),
        ),
      })
      .parse(
        await json(
          olaUrl("routing/v1/distanceMatrix", {
            origins: origins.map((p) => `${p.lat},${p.lng}`).join("|"),
            destinations: `${destination.lat},${destination.lng}`,
          }),
        ),
      );
    if (result.rows.length !== origins.length)
      throw new Error("Invalid route matrix");
    return result.rows.map(({ elements: [e] }) => ({
      distanceKm: e.distance / 1000,
      estimatedMinutes: e.duration / 60,
      source: "ola",
    }));
  },
};
/** Ola once its key is set, else OSRM. */
export function router(): RoutingProvider {
  return process.env.OLA_MAPS_API_KEY ? olaRouting : osrm;
}
export function getCoordinatesFromAddress(
  address: string | Point,
  provider: GeocodingProvider = geocoder(),
) {
  return provider.search(address);
}
/* The admin assignment view re-ranks bakeries every 10 s, one route per bakery,
   and Ola bills each request. A road between two fixed points does not change
   that fast, so a provider's answers are reused for ten minutes; fallbacks are
   not kept, so a recovered provider is asked again at once.
   ponytail: per server instance; a shared store if warm instances multiply calls. */
const ROUTE_TTL_MS = 10 * 60_000;
const routeCache = new WeakMap<RoutingProvider, Map<string, { at: number; value: RouteEstimate | null }>>();
export async function getDistanceMatrix(
  origins: Point[],
  destination: Point,
  provider: RoutingProvider = router(),
) {
  let cache = routeCache.get(provider);
  if (!cache) routeCache.set(provider, (cache = new Map()));
  if (cache.size > 2000) cache.clear();
  const key = (p: Point) => `${p.lat},${p.lng};${destination.lat},${destination.lng}`;
  const known = new Map<string, RouteEstimate | null>();
  for (const p of origins) {
    const hit = cache.get(key(p));
    if (hit && Date.now() - hit.at < ROUTE_TTL_MS) known.set(key(p), hit.value);
  }
  const missing = origins.filter((p) => !known.has(key(p)));
  // Batch to stay within OSRM's table and Ola's 50-pair limits; no network
  // requests inside locks.
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    try {
      const found = await provider.matrix(batch, destination);
      batch.forEach((p, j) => {
        known.set(key(p), found[j] ?? null);
        cache.set(key(p), { at: Date.now(), value: found[j] ?? null });
      });
    } catch {
      for (const p of batch) {
        const distanceKm = haversine(p, destination);
        known.set(key(p), {
          distanceKm,
          estimatedMinutes: (distanceKm / 20) * 60,
          source: "haversine_estimate",
        });
      }
    }
  }
  return origins.map((p) => known.get(key(p)) ?? null);
}
export async function getRouteDistance(
  a: Point,
  b: Point,
  provider?: RoutingProvider,
) {
  return (await getDistanceMatrix([a], b, provider))[0]?.distanceKm ?? null;
}
export async function getTravelTime(
  a: Point,
  b: Point,
  provider?: RoutingProvider,
) {
  return (
    (await getDistanceMatrix([a], b, provider))[0]?.estimatedMinutes ?? null
  );
}
