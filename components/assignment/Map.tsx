"use client";
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/assignmentRules";
import "leaflet/dist/leaflet.css";
export type MapPin = Point & {
  label: string;
  kind: "customer" | "bakery" | "assigned";
};
export function AssignmentMap({
  pins,
  onPick,
}: {
  pins: MapPin[];
  onPick?: (point: Point) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  const [error, setError] = useState(false);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  const serialized = JSON.stringify(pins);
  useEffect(() => {
    let map: import("leaflet").Map | undefined,
      disposed = false;
    void import("leaflet")
      .then((L) => {
        if (!node.current || disposed) return;
        const points = JSON.parse(serialized) as MapPin[];
        map = L.map(node.current, { scrollWheelZoom: false }).setView(
          [17.431, 78.407],
          13,
        );
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
      map?.remove();
    };
  }, [serialized]);
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
