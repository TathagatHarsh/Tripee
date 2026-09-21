"use client";
import { useEffect, useRef, useState } from "react";
import {
  loadMaps,
  locate,
  type LocatedAddress,
  type MapInstance,
  type MapsApi,
  type MarkerInstance,
  type Point,
} from "@/lib/location";
import { sBtn, sField } from "@/lib/shopUi";

const configured = Boolean(
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY &&
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
);
export function LocationPicker({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm(address: LocatedAddress): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocatedAddress[]>([]);
  const [selected, setSelected] = useState<LocatedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const marker = useRef<MarkerInstance | null>(null);
  const api = useRef<MapsApi | null>(null);
  const request = useRef({ id: 0 });
  const active = useRef(true);

  useEffect(() => {
    const counter = request.current;
    active.current = true;
    return () => {
      active.current = false;
      counter.id++;
    };
  }, []);

  useEffect(() => {
    if (!open || !canvas.current) return;
    const counter = request.current;
    let cancelled = false;
    const listeners: { remove(): void }[] = [];
    const reverse = async (point: Point) => {
      const id = ++request.current.id;
      setBusy(true);
      setSelected(null);
      setError("");
      try {
        const found = await locate(api.current!, point);
        if (cancelled || id !== request.current.id) return;
        if (!found[0]) throw new Error();
        // Keep the chosen pin rather than moving it to the geocoder's street centroid.
        setSelected({ ...found[0], ...point });
      } catch {
        if (!cancelled && id === request.current.id)
          setError(
            "We couldn't find an address for that pin. Move it or enter the address below.",
          );
      } finally {
        if (!cancelled && id === request.current.id) setBusy(false);
      }
    };
    loadMaps()
      .then((maps) => {
        if (cancelled || !canvas.current) return;
        api.current = maps;
        const center = { lat: 17.431, lng: 78.407 };
        map.current = new maps.Map(canvas.current, {
          center,
          zoom: 13,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        marker.current = new maps.marker.AdvancedMarkerElement({
          map: map.current,
          position: center,
          gmpDraggable: true,
          title: "Delivery pin. Drag or use arrow keys to adjust.",
        });
        listeners.push(
          marker.current.addListener("dragend", () => {
            const p = marker.current!.position;
            const point = {
              lat: typeof p.lat === "function" ? p.lat() : p.lat,
              lng: typeof p.lng === "function" ? p.lng() : p.lng,
            };
            void reverse(point);
          }),
        );
        listeners.push(
          map.current.addListener("click", (event) => {
            if (!event.latLng) return;
            const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
            marker.current!.position = point;
            void reverse(point);
          }),
        );
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      counter.id++;
      listeners.forEach((l) => l.remove());
      if (marker.current) marker.current.map = null;
      map.current = null;
    };
  }, [open]);

  function choose(address: LocatedAddress) {
    setSelected(address);
    setResults([]);
    setError("");
    map.current?.panTo(address);
    if (marker.current) marker.current.position = address;
  }
  async function search(query: string | Point) {
    if (!api.current) return;
    const id = ++request.current.id;
    setBusy(true);
    setError("");
    setSelected(null);
    setResults([]);
    try {
      const addresses = await locate(api.current, query);
      if (!active.current || id !== request.current.id) return;
      if (!addresses.length) {
        setError(
          "No address found. Try a nearby landmark or enter the address below.",
        );
        return;
      }
      if (typeof query === "string") setResults(addresses.slice(0, 5));
      else choose({ ...addresses[0], ...query });
    } catch {
      if (active.current && id === request.current.id)
        setError(
          "Location search is unavailable. Try again or enter your address manually.",
        );
    } finally {
      if (active.current && id === request.current.id) setBusy(false);
    }
  }
  function currentLocation() {
    if (!navigator.geolocation) {
      setError(
        "Your browser doesn't support location. Search or enter your address below.",
      );
      return;
    }
    const id = ++request.current.id;
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active.current || id !== request.current.id) return;
        void search({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        if (active.current && id === request.current.id) {
          setBusy(false);
          setError(
            "Location access wasn't available. You can still search or enter your address manually.",
          );
        }
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  return (
    <div className="rounded-s border border-s-line bg-s-cream p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl">Find your doorstep</h3>
          <p className="mt-1 text-sm text-s-bark">
            {configured
              ? "Search, adjust the pin, then confirm the address."
              : "Enter your address below. Map search is currently unavailable."}
          </p>
        </div>
        {configured && !open && (
          <button
            type="button"
            disabled={disabled}
            className={sBtn("outline")}
            onClick={() => setOpen(true)}
          >
            Choose on map ↗
          </button>
        )}
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search delivery location</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (query.trim().length >= 3) void search(query);
                  }
                }}
                disabled={disabled || !ready || busy}
                className={sField()}
                placeholder="Area, street or landmark"
              />
            </label>
            <button
              type="button"
              disabled={disabled || !ready || busy || query.trim().length < 3}
              className={sBtn("primary")}
              onClick={() => void search(query)}
            >
              Search
            </button>
          </div>
          <button
            type="button"
            disabled={disabled || !ready || busy}
            className={sBtn("ghost", "sm", "self-start")}
            onClick={currentLocation}
          >
            ◎ Use my current location
          </button>
          {results.length > 0 && (
            <ul
              className="divide-y divide-s-line rounded-s border border-s-line bg-s-shell"
              aria-label="Location results"
            >
              {results.map((r) => (
                <li key={r.placeId}>
                  <button
                    type="button"
                    disabled={disabled}
                    className="min-h-12 w-full p-3 text-left text-sm hover:bg-s-cream-deep"
                    onClick={() => choose(r)}
                  >
                    {r.address}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative overflow-hidden rounded-s border border-s-line">
            <div
              ref={canvas}
              className="h-72 w-full"
              aria-label="Choose your delivery pin on the map"
            />
            {!ready && !error && (
              <p
                className="absolute inset-0 grid place-items-center bg-s-cream-deep text-sm"
                role="status"
              >
                Loading map…
              </p>
            )}
          </div>
          <p className="text-xs text-s-bark">
            Click the map or drag the pin. The pin also supports keyboard
            controls. Add your flat number in the address below.
          </p>
          {busy && (
            <p role="status" className="text-sm">
              Finding your address…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-s-stop">
              {error}
            </p>
          )}
          {selected && !busy && (
            <div className="location-result rounded-s border border-s-line bg-s-shell p-4">
              <p className="mb-3 text-sm">{selected.address}</p>
              <button
                type="button"
                disabled={disabled}
                className={sBtn("primary", "sm")}
                onClick={() => onConfirm(selected)}
              >
                Use this address
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
