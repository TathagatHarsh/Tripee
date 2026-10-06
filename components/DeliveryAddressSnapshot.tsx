import { z } from "zod";
const Location = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  locality: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
});

/** Who receives a delivery: the name and number checkout stored with the pin. */
export function receiverFrom(value: unknown): { name: string | null; phone: string | null } {
  const parsed = Location.safeParse(value);
  return { name: parsed.data?.name || null, phone: parsed.data?.phone || null };
}
export function DeliveryAddressSnapshot({ value }: { value: unknown }) {
  const parsed = Location.safeParse(value);
  if (!parsed.success) return null;
  const p = parsed.data;
  const lat = p.latitude ?? p.lat;
  const lng = p.longitude ?? p.lng;
  return <div className="mt-3 text-sm">
    {p.locality && <p>Locality: {p.locality}</p>}
    {(p.name || p.phone) && <p>Receiver: {[p.name, p.phone].filter(Boolean).join(", ")}{p.phone && <> <a className="underline underline-offset-4" href={`tel:${p.phone}`}>Call</a></>}</p>}
    {lat !== undefined && lng !== undefined && <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">Open in Maps ↗</a>}
  </div>;
}
