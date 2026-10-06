"use client";
import { useEffect, useRef, useState } from "react";
import { AssignmentMap } from "@/components/assignment/Map";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { checkDeliveryServiceability } from "@/lib/delivery";
import { latest } from "@/lib/latest";
import type { LocatedAddress, Point } from "@/lib/location";
import { sBtn } from "@/lib/shopUi";

type Lookup = "idle" | "looking" | "ready" | "failed";

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

const near = (a: Point, b: Point) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

/**
 * Where the cake goes, Blinkit and Zomato style: search or use GPS, then drag
 * the map under a fixed pin. Each place the map settles is looked up (address
 * and whether a bakery reaches it) and only the newest answer is shown.
 *
 * Native <dialog>, so focus, Escape and the backdrop come with the platform.
 * The map mounts only after the dialog is shown: Leaflet sizes itself on
 * creation, and inside a closed dialog it would measure zero and draw grey.
 */
export function LocationSheet({
  open,
  initial,
  catalog,
  onClose,
  onConfirm,
  onPickup,
}: {
  open: boolean;
  initial: Point | null;
  catalog: CatalogSnapshot;
  onClose(): void;
  onConfirm(address: LocatedAddress): void;
  onPickup(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const searches = useRef(latest());
  const lookups = useRef(latest());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chosen = useRef<LocatedAddress | null>(null);
  const source = useRef<"map" | "current_location">("map");

  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocatedAddress[]>([]);
  const [target, setTarget] = useState<Point | null>(initial);
  const [point, setPoint] = useState<Point | null>(initial);
  const [here, setHere] = useState<LocatedAddress | null>(null);
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [covered, setCovered] = useState<boolean | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      /* Reopen at the confirmed pin ("Change"), not wherever the last search
         or drag left the map; the map looks that pin up as it mounts. */
      setTarget(initial);
      setPoint(initial);
      setHere(null);
      setCovered(null);
      setLookup("idle");
      chosen.current = null;
      d.showModal();
      setShown(true);
    } else if (!open && d.open) d.close();
  }, [open, initial]);

  /* Search as you type: 350ms after the last key, three characters or more.
     A picked suggestion fills the box too, and must not search for itself. */
  useEffect(() => {
    if (query.trim().length < 3 || query === chosen.current?.address) return;
    const id = searches.current.next();
    const t = setTimeout(() => {
      post<{ results: LocatedAddress[] }>("/api/location", query.trim())
        .then((data) => {
          if (searches.current.isCurrent(id)) setResults(data.results);
        })
        .catch(() => {
          if (searches.current.isCurrent(id)) setNote("Search is unavailable right now. Move the map to your door instead.");
        });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  /* The map settled: look up what is under the pin, 500ms after it stops. */
  function settled(p: Point) {
    setPoint(p);
    clearTimeout(timer.current);
    const id = lookups.current.next();
    setLookup("looking");
    timer.current = setTimeout(async () => {
      const picked = chosen.current && near(chosen.current, p) ? chosen.current : null;
      const [address, coverage] = await Promise.allSettled([
        picked ? Promise.resolve(picked) : post<{ results: LocatedAddress[] }>("/api/location", p).then((d) => d.results[0] ?? null),
        post<{ covered: boolean }>("/api/serviceability", p),
      ]);
      if (!lookups.current.isCurrent(id)) return;
      const found = address.status === "fulfilled" ? address.value : null;
      setHere(found ? { ...found, lat: p.lat, lng: p.lng } : null);
      setLookup(found ? "ready" : "failed");
      /* Coverage that could not be checked is not a refusal: the order route
         checks again before anything is taken. */
      setCovered(coverage.status === "fulfilled" ? coverage.value.covered : true);
    }, 500);
  }

  function choose(r: LocatedAddress) {
    chosen.current = r;
    source.current = "map";
    setResults([]);
    setQuery(r.address);
    setTarget({ lat: r.lat, lng: r.lng });
  }

  function useGps() {
    setNote("");
    if (!navigator.geolocation) {
      setNote("Location isn't available here. Search for your area instead.");
      searchBox.current?.focus();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        chosen.current = null;
        source.current = "current_location";
        setTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setNote("Location is off. Search for your area instead.");
        searchBox.current?.focus();
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  const zoneOk = here?.pincode
    ? checkDeliveryServiceability({ postalCode: here.pincode }, catalog).serviceable
    : true;
  const settledHere = lookup === "ready" || lookup === "failed";
  const refused = settledHere && (covered === false || !zoneOk);
  const canConfirm = settledHere && !refused && point !== null;

  return (
    <dialog
      ref={dialog}
      onClose={() => {
        setShown(false);
        onClose();
      }}
      aria-labelledby="location-sheet-title"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-s-cream p-0 text-s-cocoa backdrop:bg-black/40 sm:m-auto sm:h-[min(46rem,92dvh)] sm:max-w-xl sm:rounded-s sm:border sm:border-s-line"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <h2 id="location-sheet-title" className="text-xl">Where should we deliver?</h2>
          <button type="button" className={sBtn("ghost", "sm")} onClick={() => dialog.current?.close()} aria-label="Close">
            Close
          </button>
        </div>

        <div className="relative px-4">
          <label htmlFor="location-search" className="sr-only">Search for your area, street or building</label>
          <input
            id="location-search"
            ref={searchBox}
            type="search"
            autoComplete="off"
            placeholder="Search area, street or building"
            value={query}
            onChange={(e) => {
              setNote("");
              setQuery(e.target.value);
              if (e.target.value.trim().length < 3) setResults([]);
            }}
            className="w-full rounded-s border border-s-line bg-s-shell px-4 py-3 text-base"
          />
          {results.length > 0 && (
            <ul className="absolute inset-x-4 top-full z-[500] mt-1 max-h-72 overflow-y-auto rounded-s border border-s-line bg-s-shell shadow-lg">
              {results.map((r) => (
                <li key={r.placeId || `${r.lat},${r.lng}`}>
                  <button type="button" onClick={() => choose(r)} className="block min-h-11 w-full px-4 py-2.5 text-left text-sm hover:bg-s-cream-deep">
                    {r.address}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={useGps} className={sBtn("outline", "sm", "mt-2 w-full")}>
            Use my current location
          </button>
          {note && <p role="status" className="mt-2 text-sm text-s-bark">{note}</p>}
        </div>

        <div className="relative mt-3 min-h-72 flex-1 border-y border-s-line">
          {shown && <AssignmentMap mode="center" center={target} onCenter={settled} />}
        </div>

        <div className="flex flex-col gap-3 p-4" aria-live="polite">
          {lookup === "idle" && <p className="text-sm text-s-bark">Move the map so the pin sits on your door.</p>}
          {lookup === "looking" && <p className="text-sm text-s-bark">Finding this address…</p>}
          {lookup === "ready" && here && (
            <div>
              <p className="font-semibold">{here.address || here.locality || "Pinned location"}</p>
              <p className="text-sm text-s-bark">{[here.locality, here.city, here.pincode].filter(Boolean).join(", ")}</p>
            </div>
          )}
          {lookup === "failed" && (
            <p className="text-sm text-s-bark">We couldn&rsquo;t name this spot. You can still use the pin and type the area next.</p>
          )}
          {refused && (
            <div role="alert" className="rounded-s border border-s-stop/40 bg-s-berry-wash p-3 text-sm">
              <p className="font-semibold text-s-stop">We don&rsquo;t deliver here yet</p>
              <button type="button" onClick={onPickup} className={sBtn("outline", "sm", "mt-2")}>
                Switch to pickup
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!point) return;
              onConfirm({
                ...(here ?? { address: "", city: "", state: "", pincode: "", placeId: "" }),
                lat: point.lat,
                lng: point.lng,
                source: source.current,
              });
              dialog.current?.close();
            }}
            className={sBtn("primary", "md", "w-full")}
          >
            Confirm location
          </button>
        </div>
      </div>
    </dialog>
  );
}
