/** Small typed boundary around Maps JS; loaded only after a customer asks for a map. */
export type Point = { lat: number; lng: number };
export type LocatedAddress = Point & {
  address: string;
  city: string;
  state: string;
  pincode: string;
  placeId: string;
};
type LatLng = { lat(): number; lng(): number };
type MapsEvent = { latLng?: LatLng };
type Listener = { remove(): void };
export type MapInstance = {
  panTo(point: Point): void;
  addListener(event: string, callback: (event: MapsEvent) => void): Listener;
};
export type MarkerInstance = {
  position: Point | LatLng;
  map: MapInstance | null;
  addListener(event: string, callback: () => void): Listener;
};
type Result = {
  formatted_address: string;
  place_id: string;
  geometry: { location: LatLng };
  address_components: { long_name: string; types: string[] }[];
};
export type MapsApi = {
  Map: new (
    node: HTMLElement,
    options: {
      center: Point;
      zoom: number;
      mapId: string;
      streetViewControl: boolean;
      mapTypeControl: boolean;
      fullscreenControl: boolean;
    },
  ) => MapInstance;
  marker: {
    AdvancedMarkerElement: new (options: {
      map: MapInstance;
      position: Point;
      gmpDraggable: boolean;
      title: string;
    }) => MarkerInstance;
  };
  Geocoder: new () => {
    geocode(request: {
      address?: string;
      location?: Point;
      componentRestrictions?: { country: string };
    }): Promise<{ results: Result[] }>;
  };
};
type MapsWindow = Window & {
  google?: { maps: MapsApi };
  mmcMapsReady?: () => void;
  gm_authFailure?: () => void;
};
let loading: Promise<MapsApi> | undefined;
export function loadMaps(): Promise<MapsApi> {
  const win = window as MapsWindow;
  if (win.google?.maps?.marker) return Promise.resolve(win.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => fail(), 15000);
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      loading = undefined;
      reject(
        new Error(
          "The map couldn't load. Enter your address manually or try again.",
        ),
      );
    };
    win.mmcMapsReady = () => {
      clearTimeout(timeout);
      if (win.google?.maps) resolve(win.google.maps);
      else fail();
    };
    win.gm_authFailure = fail;
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "", v: "quarterly", libraries: "marker,geocoding", loading: "async", callback: "mmcMapsReady" })}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
export async function locate(
  maps: MapsApi,
  query: string | Point,
): Promise<LocatedAddress[]> {
  const { results } = await new maps.Geocoder().geocode(
    typeof query === "string"
      ? { address: query, componentRestrictions: { country: "IN" } }
      : { location: query },
  );
  return results
    .filter((r) =>
      r.address_components.some(
        (c) => c.types.includes("country") && c.long_name === "India",
      ),
    )
    .map((r) => {
      const component = (...types: string[]) =>
        r.address_components.find((c) => types.some((t) => c.types.includes(t)))
          ?.long_name ?? "";
      return {
        lat: r.geometry.location.lat(),
        lng: r.geometry.location.lng(),
        address: r.formatted_address,
        placeId: r.place_id,
        city: component(
          "locality",
          "postal_town",
          "administrative_area_level_3",
        ),
        state: component("administrative_area_level_1"),
        pincode: component("postal_code"),
      };
    });
}
