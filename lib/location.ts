export type { Point } from "./assignmentRules";
export type LocatedAddress = { lat: number; lng: number; address: string; locality?: string; source?: "map" | "current_location"; city: string; state: string; pincode: string; placeId: string };

/** Hyderabad, as [west, south, east, north]: what search is bounded to. */
export const HYDERABAD_BBOX = [78.2, 17.2, 78.7, 17.6] as const;

export type PhotonFeature = {
  geometry: { coordinates: [number, number] | number[] };
  properties: {
    name?: string; housenumber?: string; street?: string; locality?: string; district?: string;
    city?: string; county?: string; state?: string; postcode?: string; countrycode?: string;
    osm_type?: string; osm_id?: number | string;
  };
};

/**
 * One Photon (OSM) feature as a delivery address, or null outside India.
 *
 * A reverse lookup's `name` is usually the nearest landmark (a creche, a shop),
 * not the customer's building, so only search results lead with it. Photon
 * often leaves `city` empty in Hyderabad and fills `district` as "Ward 93
 * Banjara Hills"; both are tidied here.
 */
export function photonToAddress(feature: PhotonFeature, kind: "search" | "reverse"): LocatedAddress | null {
  const p = feature.properties;
  if (p.countrycode !== "IN") return null;
  const [lng, lat] = feature.geometry.coordinates;
  const [west, south, east, north] = HYDERABAD_BBOX;
  const inHyderabad = lng >= west && lng <= east && lat >= south && lat <= north;
  const locality = (p.locality ?? p.district ?? "").replace(/^Ward \d+\s+/, "");
  return {
    lat,
    lng,
    address: [kind === "search" ? p.name : undefined, p.housenumber, p.street, locality].filter(Boolean).join(", "),
    locality,
    city: p.city ?? (inHyderabad ? "Hyderabad" : p.county ?? ""),
    state: p.state ?? "",
    pincode: p.postcode ?? "",
    placeId: `${p.osm_type ?? ""}${p.osm_id ?? ""}`,
  };
}
