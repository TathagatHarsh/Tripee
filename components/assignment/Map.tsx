"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, RequestParameters, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Point } from "@/lib/assignmentRules";
export type MapPin = Point & {
  label: string;
  kind: "customer" | "bakery" | "assigned";
};

const OLA_KEY = process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY;
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/* Ola Maps' vector map once its browser key is set; until then the OSM raster
   tiles this map has always drawn. */
const STYLE: string | StyleSpecification = OLA_KEY
  ? "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json"
  : {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: [process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          maxzoom: 19,
          attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? OSM,
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    };
/* As Ola's own web SDK does: every request to Ola but plain images carries the key. */
function withKey(url: string, type?: string): RequestParameters {
  if (!OLA_KEY || type === "Image" || !url.startsWith("https://api.olamaps.io/")) return { url };
  const signed = new URL(url);
  signed.searchParams.set("api_key", OLA_KEY);
  return { url: signed.toString() };
}
const COLOR = { customer: "#2563eb", bakery: "#a85532", assigned: "#15803d" };

/* Ola's standard style references 3d_model, but vectordata only exposes
   hyperchargers. Remove the invalid reference before MapLibre loads sources. */
export function withoutOlaModelLayer(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.filter((layer) =>
      !("source" in layer && layer.source === "vectordata" && layer["source-layer"] === "3d_model")),
  };
}

/**
 * `pins` mode draws labelled points (admin and vendor views). `center` mode is
 * the checkout picker: a fixed pin over the middle, the map moves under it, and
 * `onCenter` reports where it settled. A new `center` prop moves the map there
 * without rebuilding it; do not feed `onCenter` back into `center`.
 *
 * MapLibre counts zoom in 512px tiles, so each level here is one below what
 * Leaflet used for the same view.
 */
export function AssignmentMap({
  pins = [],
  mode = "pins",
  center,
  onCenter,
}: {
  pins?: MapPin[];
  mode?: "pins" | "center";
  center?: Point | null;
  onCenter?: (point: Point) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const live = useRef<MapLibreMap | null>(null);
  /* Where the map last reported settling. MapLibre follows its box's size, and
     a resize ends a "move" that moved nothing; without this, the sheet's text
     changing height would look the same point up for ever. */
  const reported = useRef<Point | null>(null);
  const settle = useRef(onCenter);
  const start = useRef(center);
  const [error, setError] = useState(false);
  useEffect(() => {
    settle.current = onCenter;
  }, [onCenter]);
  const serialized = JSON.stringify(pins);
  useEffect(() => {
    let map: MapLibreMap | undefined,
      disposed = false;
    void import("maplibre-gl")
      .then(({ Map, Marker, Popup, LngLatBounds }) => {
        if (!node.current || disposed) return;
        const points = JSON.parse(serialized) as MapPin[];
        const c = start.current;
        const at = mode === "center" ? (c ?? { lat: 17.385, lng: 78.4867 }) : { lat: 17.431, lng: 78.407 };
        map = new Map({
          container: node.current,
          transformRequest: withKey,
          center: [at.lng, at.lat],
          zoom: mode === "center" ? (c ? 16 : 11) : 12,
          scrollZoom: mode === "center",
          /* OSM's raster tiles stop at 19 (map zoom 18 at 256px); past that they only blur. */
          maxZoom: OLA_KEY ? undefined : 18,
          attributionControl: {
            compact: true,
            customAttribution: OLA_KEY ? `<a href="https://maps.olakrutrim.com" target="_blank" rel="noopener noreferrer">Ola Maps</a> | ${OSM}` : undefined,
          },
        });
        map.setStyle(STYLE, OLA_KEY ? {
          transformStyle: (_, style) => withoutOlaModelLayer(style),
        } : undefined);
        live.current = map;
        if (mode === "center") {
          reported.current = at;
          map.on("moveend", () => {
            const p = map!.getCenter(), last = reported.current;
            if (last && Math.abs(last.lat - p.lat) < 1e-7 && Math.abs(last.lng - p.lng) < 1e-7) return;
            reported.current = { lat: p.lat, lng: p.lng };
            settle.current?.(reported.current);
          });
          /* A known starting pin (reopening to change it) is looked up at once. */
          if (c) settle.current?.(c);
        }
        for (const p of points)
          new Marker({ color: COLOR[p.kind], scale: p.kind === "assigned" ? 1 : 0.8 })
            .setLngLat([p.lng, p.lat])
            .setPopup(new Popup({ closeButton: false, closeOnClick: false }).setText(p.label))
            .addTo(map)
            .togglePopup();
        if (points.length) {
          const bounds = new LngLatBounds();
          for (const p of points) bounds.extend([p.lng, p.lat]);
          map.fitBounds(bounds, { padding: 60, maxZoom: 14, animate: false });
        }
      })
      .catch(() => setError(true));
    return () => {
      disposed = true;
      live.current = null;
      map?.remove();
    };
  }, [serialized, mode]);
  /* Keyed on the object, not its coordinates: picking the same place again,
     even where the map already sits, must still be reported. Without a map (no
     WebGL) a picked place is reported as it is, so checkout can go on. */
  useEffect(() => {
    if (!center) return;
    const map = live.current;
    if (!map) {
      if (error) settle.current?.(center);
      return;
    }
    reported.current = null;
    map.jumpTo({ center: [center.lng, center.lat], zoom: Math.max(map.getZoom(), 15) });
  }, [center, error]);
  if (mode === "center")
    return (
      <div className="relative h-full min-h-72 w-full">
        {/* Inline because maplibre-gl.css sets `position: relative` on the map,
            and unlayered CSS outranks Tailwind's `absolute`. */}
        <div ref={node} className="inset-0 z-0" style={{ position: "absolute" }} role="region" aria-label="Move the map to put the pin on your door" />
        {/* The pin is still; the map moves. Its tip sits on the centre point. */}
        <svg aria-hidden="true" viewBox="0 0 24 36" className="pointer-events-none absolute top-1/2 left-1/2 z-[400] h-10 w-7 -translate-x-1/2 -translate-y-full drop-shadow">
          <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 36 12 36s12-15.2 12-24.1C24 5.3 18.6 0 12 0z" fill="var(--color-s-berry, #9a472b)" />
          <circle cx="12" cy="12" r="4.5" fill="#fff" />
        </svg>
        {error && <p role="alert" className="absolute inset-x-0 bottom-0 z-[400] bg-white/90 p-2 text-sm">Map unavailable. Search still works.</p>}
      </div>
    );
  return (
    <div>
      <div
        ref={node}
        className="relative z-0 h-80 w-full rounded-xl border border-stone-200"
        role="region"
        aria-label="Customer and bakery locations"
      />
      {error && (
        <p role="alert">
          Map unavailable. Assignment details are still available below.
        </p>
      )}
      <p className="mt-2 text-xs text-stone-500">
        Blue: customer · Brown: bakery · Green: assigned bakery
      </p>
    </div>
  );
}
