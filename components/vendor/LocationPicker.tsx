"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AssignmentMap } from "@/components/assignment/Map";
import { aBtn, aField } from "@/components/admin/ui";
import { RADIUS_KM } from "@/lib/assignmentRules";
import type { LocatedAddress, Point } from "@/lib/location";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? String(r.status));
  return data as T;
}

/** Hyderabad, for a bakery that has never placed a pin. */
const START: Point = { lat: 17.385, lng: 78.4867 };

/**
 * The bakery places its own pin on the Ola map and picks how far it delivers.
 * Search, "use my location" and drag-the-map all end at the pin under the
 * centre, the same way the checkout's LocationSheet works.
 */
export function LocationPicker({ initial, radiusKm, setAt }: { initial: Point | null; radiusKm: number; setAt: Date | null }) {
  const router = useRouter();
  const [target, setTarget] = useState<Point>(initial ?? START);
  const [point, setPoint] = useState<Point | null>(initial);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocatedAddress[]>([]);
  const [km, setKm] = useState(Math.min(RADIUS_KM.max, Math.max(RADIUS_KM.min, radiusKm)));
  const [moving, setMoving] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const lookup = useRef(0);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 3 || query === picked.current) return;
    const t = setTimeout(() => {
      post<{ results: LocatedAddress[] }>("/api/location", query.trim())
        .then((d) => setResults(d.results))
        .catch(() => setNote("Search isn't working right now. Move the map to your bakery instead."));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  function settled(p: Point) {
    setPoint(p);
    const id = ++lookup.current;
    post<{ results: LocatedAddress[] }>("/api/location", p)
      .then((d) => { if (id === lookup.current) setAddress(d.results[0]?.address ?? ""); })
      .catch(() => { if (id === lookup.current) setAddress(""); });
  }

  function choose(r: LocatedAddress) {
    picked.current = r.address;
    setQuery(r.address);
    setResults([]);
    setTarget({ lat: r.lat, lng: r.lng });
  }

  function useGps() {
    setNote("");
    if (!navigator.geolocation) return setNote("Location isn't available here. Search for your bakery instead.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setNote("Location is off. Search for your bakery instead."),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  async function save() {
    if (!point) return;
    setSaving(true);
    setNote("");
    try {
      await post("/api/vendor/location", { lat: point.lat, lng: point.lng, radiusKm: km, address: address || undefined });
      setNote("Location saved. You can now get orders.");
      router.refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="location" aria-labelledby="location-title" className="flex flex-col gap-4 rounded-xl border border-a-line bg-a-surface p-5">
      <div>
        <h2 id="location-title" className="text-lg font-semibold">Bakery location</h2>
        <p className="text-sm text-a-muted">
          {setAt
            ? `Set on ${setAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Move the pin or change the distance any time.`
            : "You won't get any orders until you place this pin on your bakery and save it."}
        </p>
      </div>

      <div className="relative flex flex-wrap gap-2">
        <input
          id="location-search"
          aria-label="Search for your bakery's area or street"
          className={aField("min-w-0 flex-1")}
          placeholder="Search your area or street"
          value={query}
          onChange={(e) => { picked.current = null; setQuery(e.target.value); }}
        />
        <button type="button" onClick={useGps} className={aBtn("ghost", "md")}>Use my location</button>
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-lg border border-a-line bg-a-surface shadow">
            {results.map((r) => (
              <li key={r.placeId || `${r.lat},${r.lng}`}>
                <button type="button" onClick={() => choose(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-a-idle-wash">{r.address}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative h-72 overflow-hidden rounded-lg border border-a-line">
        <AssignmentMap mode="center" center={target} onCenter={settled} onMoving={setMoving} />
      </div>
      <p className="text-sm" aria-live="polite">
        {moving ? "Moving…" : address || "Drag the map so the pin sits on your bakery."}
      </p>

      <label htmlFor="location-km" className="flex flex-col gap-2 text-sm">
        <span>How far you deliver: <strong>{km} km</strong></span>
        <input
          id="location-km"
          type="range"
          min={RADIUS_KM.min}
          max={RADIUS_KM.max}
          step={1}
          value={km}
          onChange={(e) => setKm(Number(e.target.value))}
        />
        <span className="flex justify-between text-a-muted"><span>{RADIUS_KM.min} km</span><span>{RADIUS_KM.max} km</span></span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!point || moving || saving} onClick={save} className={aBtn("primary", "md")}>
          {saving ? "Saving…" : "Save location"}
        </button>
        {note && <p role="status" className="text-sm">{note}</p>}
      </div>
    </section>
  );
}
