"use client";
import { useRef, useState } from "react";
import type { LocatedAddress, Point } from "@/lib/location";
import { AssignmentMap } from "@/components/assignment/Map";
import { sBtn } from "@/lib/shopUi";
export function LocationPicker({
  onConfirm,
  onManual,
  disabled,
}: {
  onConfirm: (address: LocatedAddress) => void;
  onManual: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [results, setResults] = useState<LocatedAddress[]>([]),
    [selected, setSelected] = useState<LocatedAddress | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef(0);
  function choosePin(point: Point, source: "map" | "current_location" = "map") {
    request.current++;
    setBusy(false);
    setError("");
    setOpen(true);
    setSelected({
      ...point,
      source,
      address: "Selected delivery pin — complete your address below",
      city: "",
      state: "",
      pincode: "",
      placeId: "",
    });
  }
  async function search() {
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      const data = await response.json();
      if (id !== request.current) return;
      if (!response.ok) throw new Error(data.error);
      setResults(data.results);
      if (!data.results.length)
        setError(
          "No address found. Select a pin and enter your address below.",
        );
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : "Search unavailable");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  function currentLocation() {
    if (!navigator.geolocation) {
      setError("Location is unavailable. Enter your address manually.");
      return;
    }
    const id = ++request.current;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (id === request.current)
          choosePin(
            { lat: p.coords.latitude, lng: p.coords.longitude },
            "current_location",
          );
      },
      () => {
        if (id === request.current) {
          setBusy(false);
          setError(
            "Location permission denied or unavailable. Select a pin or enter your address.",
          );
        }
      },
      { timeout: 10000 },
    );
  }
  return (
    <div className="delivery-location p-4 sm:p-6">
      <h3 className="text-xl">Find your doorstep</h3>
      <p className="mt-1 text-sm text-s-bark">
        Select your delivery pin, then complete the address below.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={sBtn("outline")}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          Search delivery location ↗
        </button>
        <button
          type="button"
          className={sBtn("primary")}
          disabled={disabled || busy}
          onClick={currentLocation}
        >
          ◎ Use my current location
        </button>
        <button
          type="button"
          className={sBtn("ghost")}
          disabled={disabled}
          onClick={() => {
            request.current++;
            setBusy(false);
            setOpen(false);
            setSelected(null);
            onManual();
          }}
        >
          Enter address manually
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input
              aria-label="Search delivery location"
              className="min-w-0 flex-1 rounded-lg border p-3"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <button
              type="button"
              className={sBtn("outline")}
              disabled={disabled || busy || query.trim().length < 3}
              onClick={() => void search()}
            >
              Search
            </button>
          </div>
          {results.map((r) => (
            <button
              type="button"
              key={r.placeId}
              className="block w-full rounded-lg border p-3 text-left"
              disabled={disabled}
              onClick={() => {
                request.current++;
                setSelected(r);
                setResults([]);
              }}
            >
              {r.address}
            </button>
          ))}
          <AssignmentMap
            pins={
              selected
                ? [{ ...selected, label: "Delivery pin", kind: "customer" }]
                : []
            }
            onPick={disabled ? undefined : choosePin}
          />
          <p className="text-xs">
            Click the map to select a pin, or use arrow keys to pan and Enter to
            select the center. Search and current location are also available.
          </p>
          {selected && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-sm">
                {selected.address} ({selected.lat.toFixed(5)},{" "}
                {selected.lng.toFixed(5)})
              </p>
              <button
                type="button"
                className={sBtn("primary")}
                disabled={disabled}
                onClick={() => onConfirm(selected)}
              >
                Confirm this location
              </button>
            </div>
          )}
        </div>
      )}
      {busy && <p role="status">Finding your address…</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-s-stop">
          {error}
        </p>
      )}
    </div>
  );
}
