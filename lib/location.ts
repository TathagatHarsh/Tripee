import type { Point } from "./assignmentRules";
export type { Point };
export type LocatedAddress = { lat: number; lng: number; address: string; locality?: string; source?: "map" | "current_location"; city: string; state: string; pincode: string; placeId: string };

/** Hyderabad, as [west, south, east, north]: what search is bounded to. */
export const HYDERABAD_BBOX = [78.2, 17.2, 78.7, 17.6] as const;
export function inHyderabad({ lat, lng }: Point): boolean {
  const [west, south, east, north] = HYDERABAD_BBOX;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

/**
 * An address line without the parts checkout stores in their own fields
 * (locality, city, state, pincode) or "India", so the saved address does not
 * repeat them. Possibly empty: the locality then names the spot.
 */
export function streetPart(text: string, parts: Pick<LocatedAddress, "locality" | "city" | "state" | "pincode">): string {
  const drop = new Set([parts.locality, parts.city, parts.state, parts.pincode, "India"].filter(Boolean).map((s) => s!.toLowerCase()));
  return text.split(",").map((s) => s.trim()).filter((s) => s && !drop.has(s.toLowerCase())).join(", ");
}

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
  const locality = (p.locality ?? p.district ?? "").replace(/^Ward \d+\s+/, "");
  return {
    lat,
    lng,
    address: [kind === "search" ? p.name : undefined, p.housenumber, p.street, locality].filter(Boolean).join(", "),
    locality,
    city: p.city ?? (inHyderabad({ lat, lng }) ? "Hyderabad" : p.county ?? ""),
    state: p.state ?? "",
    pincode: p.postcode ?? "",
    placeId: `${p.osm_type ?? ""}${p.osm_id ?? ""}`,
  };
}

/** An Ola Maps autocomplete prediction or reverse-geocode result. */
export type OlaPlace = {
  description?: string; formatted_address?: string; name?: string; place_id?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  /* Ola's own samples sometimes nest `types` one array deeper; both are read. */
  address_components?: { long_name: string; types: (string | string[])[] }[];
};

/**
 * One Ola result as a delivery address, or null without coordinates.
 *
 * A suggestion carries a name and a point but no parts; it keeps its full text
 * to tell suggestions apart, and its city and pincode come from the pin lookup
 * once it is picked. A reverse result leads with the nearest landmark's name,
 * which is not the customer's building, so as with Photon only suggestions keep
 * it; its line is cut to the street, the rest having fields of their own.
 */
export function olaToAddress(r: OlaPlace, kind: "search" | "reverse"): LocatedAddress | null {
  const { lat, lng } = r.geometry?.location ?? {};
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const part = (...types: string[]) =>
    types.map((t) => r.address_components?.find((c) => c.types.flat().includes(t))?.long_name).find(Boolean) ?? "";
  const parts = {
    locality: part("sublocality", "postal_town", "neighborhood"),
    city: part("locality", "administrative_area_level_3"),
    state: part("administrative_area_level_1"),
    pincode: part("postal_code"),
  };
  let address = (kind === "search" ? r.description : r.formatted_address) ?? "";
  if (kind === "reverse" && r.name && address.startsWith(`${r.name}, `)) address = address.slice(r.name.length + 2);
  return { lat, lng, address: streetPart(address, parts), ...parts, placeId: r.place_id ?? "" };
}
