import "server-only";
import { z } from "zod";
import { haversine, type Point, type RouteEstimate } from "./assignmentRules";
import type { LocatedAddress } from "./location";

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
export function getCoordinatesFromAddress(
  address: string | Point,
  provider: GeocodingProvider = nominatim,
) {
  return provider.search(address);
}
export async function getDistanceMatrix(
  origins: Point[],
  destination: Point,
  provider: RoutingProvider = osrm,
) {
  // Batch to stay within OSRM's table limits; no network requests inside locks.
  const result: (RouteEstimate | null)[] = [];
  for (let i = 0; i < origins.length; i += 40) {
    const batch = origins.slice(i, i + 40);
    try {
      result.push(...(await provider.matrix(batch, destination)));
    } catch {
      result.push(
        ...batch.map((p) => {
          const distanceKm = haversine(p, destination);
          return {
            distanceKm,
            estimatedMinutes: (distanceKm / 20) * 60,
            source: "haversine_estimate",
          };
        }),
      );
    }
  }
  return result;
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
