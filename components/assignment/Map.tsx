"use client";
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/assignmentRules";
import "leaflet/dist/leaflet.css";
export type MapPin = Point & {
  label: string;
  kind: "customer" | "bakery" | "assigned";
};
/**
 * `pins` mode draws labelled points (admin and vendor views). `center` mode is
 * the checkout picker: a fixed pin over the middle, the map moves under it, and
 * `onCenter` reports where it settled. A new `center` prop moves the map there
 * without rebuilding it; do not feed `onCenter` back into `center`.
 */
export function AssignmentMap({
  pins = [],
  onPick,
  mode = "pins",
  center,
  onCenter,
}: {
  pins?: MapPin[];
  onPick?: (point: Point) => void;
  mode?: "pins" | "center";
  center?: Point | null;
  onCenter?: (point: Point) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const live = useRef<import("leaflet").Map | null>(null);
  const pick = useRef(onPick);
  const settle = useRef(onCenter);
  const start = useRef(center);
  const [error, setError] = useState(false);
  useEffect(() => {
    pick.current = onPick;
    settle.current = onCenter;
  }, [onPick, onCenter]);
  const serialized = JSON.stringify(pins);
  useEffect(() => {
    let map: import("leaflet").Map | undefined,
      disposed = false;
    void import("leaflet")
      .then((L) => {
        if (!node.current || disposed) return;
        const points = JSON.parse(serialized) as MapPin[];
        /* No animations. A zoom still in flight when this effect is cleaned up
           (navigation, a refresh re-rendering the pins, Fast Refresh) fires
           its last frame after map.remove() has deleted the panes, and Leaflet
           throws "Cannot read properties of undefined (reading
           '_leaflet_pos')". A locator map gains nothing from the motion. */
        map = L.map(node.current, {
          scrollWheelZoom: mode === "center",
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        });
        live.current = map;
        if (mode === "center") {
          const c = start.current ?? { lat: 17.385, lng: 78.4867 };
          map.setView([c.lat, c.lng], start.current ? 17 : 12);
          map.on("moveend", () => {
            const p = map!.getCenter();
            settle.current?.({ lat: p.lat, lng: p.lng });
          });
          /* A known starting pin (reopening to change it) is looked up at once. */
          if (start.current) settle.current?.(start.current);
        } else if (!points.length) map.setView([17.431, 78.407], 13);
        L.tileLayer(
          process.env.NEXT_PUBLIC_MAP_TILE_URL ??
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ??
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        ).addTo(map);
        for (const p of points) {
          const label = document.createElement("span");
          label.textContent = p.label;
          L.circleMarker([p.lat, p.lng], {
            radius: p.kind === "assigned" ? 12 : 9,
            color:
              p.kind === "customer"
                ? "#2563eb"
                : p.kind === "assigned"
                  ? "#15803d"
                  : "#a85532",
            fillOpacity: 0.85,
          })
            .addTo(map)
            .bindTooltip(label, { permanent: true, direction: "top" });
        }
        if (points.length)
          map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
            padding: [60, 60],
            maxZoom: 15,
            animate: false,
          });
        map.on("click", (e) =>
          pick.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
        );
        map.on("keypress", (e) => {
          if (e.originalEvent.key === "Enter" && map) {
            const p = map.getCenter();
            pick.current?.({ lat: p.lat, lng: p.lng });
          }
        });
      })
      .catch(() => setError(true));
    return () => {
      disposed = true;
      live.current = null;
      map?.off();
      map?.remove();
    };
  }, [serialized, mode]);
  /* Keyed on the object, not its coordinates: picking the same place again
     after dragging away must still bring the map back. */
  useEffect(() => {
    const map = live.current;
    if (!map || !center) return;
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 16), { animate: false });
  }, [center]);
  if (mode === "center")
    return (
      <div className="relative h-full min-h-72 w-full">
        <div ref={node} className="absolute inset-0 z-0" role="region" aria-label="Move the map to put the pin on your door" />
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
        aria-label={
          onPick ? "Select delivery location" : "Customer and bakery locations"
        }
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
