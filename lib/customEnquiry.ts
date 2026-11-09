/**
 * The WhatsApp message a custom-cake enquiry sends.
 *
 * Custom cakes are quoted in a chat, so the popup on /custom-cakes collects
 * what the bakery would otherwise ask one question at a time (size, sponge,
 * date, where it goes) and puts it all in the first message. No server, no
 * database: the customer's own WhatsApp sends it.
 */
export interface Enquiry {
  name: string;
  size: string;
  quantity: number;
  sponge: "Eggless" | "With egg";
  flavour: string;
  message: string;
  /** YYYY-MM-DD from a date input. */
  date: string;
  time: string;
  address: string;
  pincode: string;
  notes: string;
}

export const SIZES = ["0.5 kg", "1 kg", "1.5 kg", "2 kg", "3 kg", "4 kg", "5 kg or more"];
export const TIMES = ["Any time", "Morning (10am–1pm)", "Afternoon (1pm–5pm)", "Evening (5pm–9pm)", "Midnight (11:30pm–12:30am)"];

/** "Sun, 16 Nov 2026" for a YYYY-MM-DD, read as an Indian calendar date. */
function readableDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  return Number.isNaN(d.getTime())
    ? ymd
    : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
}

/** The whole enquiry as one message. `cakeLink` is null when the customer is sending their own photo. */
export function enquiryText(e: Enquiry, cakeLink: string | null): string {
  const line = (label: string, value: string) => (value.trim() ? `${label}: ${value.trim()}` : null);
  return [
    "Hi MakeYourCakes! I'd like a custom cake.",
    "",
    cakeLink ? `Design: ${cakeLink}` : "Design: I'll send a photo of it in this chat.",
    line("Name", e.name),
    `Size: ${e.size}${e.quantity > 1 ? ` × ${e.quantity} cakes` : ""}`,
    `Sponge: ${e.sponge}`,
    line("Flavour", e.flavour),
    e.message.trim() ? `Message on the cake: "${e.message.trim()}"` : null,
    `Delivery: ${readableDate(e.date)}, ${e.time}`,
    `Address: ${e.address.trim()}, ${e.pincode.trim()}`,
    line("Notes", e.notes),
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** A wa.me link to an already-normalised number (digits with country code). */
export function enquiryHref(to: string, e: Enquiry, cakeLink: string | null): string {
  return `https://wa.me/${to}?text=${encodeURIComponent(enquiryText(e, cakeLink))}`;
}
