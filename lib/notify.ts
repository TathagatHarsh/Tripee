/**
 * Telling somebody an order arrived.
 *
 * app/kitchen/page.tsx opens by describing the hole this fills: for a long time
 * an order could be placed and "the bakery would never learn of it" — no GET,
 * no admin page, no notification. The board closed the first two. This is the
 * third, and it is deliberately the smallest thing that closes it.
 *
 * What is here: a shape for the news, a channel interface, and one channel that
 * writes a structured line to the server log. That line is genuinely useful —
 * it is what a log drain or an alert rule reads — and it means the seam is
 * exercised by every real order rather than sitting untested until the day
 * somebody adds email.
 *
 * What is deliberately not here: email, WhatsApp and SMS. Each needs an account,
 * a key, a sending domain and a decision about who pays for it, and writing
 * three adapters nobody has credentials for would be three untested files
 * pretending the problem was solved. Adding one is `addChannel(...)` and a
 * function with a five-field argument.
 *
 * Failure is swallowed on purpose, and only here: a notification that cannot be
 * sent must never fail the order that triggered it. The customer's cake is real
 * and recorded; the announcement is a courtesy to the kitchen, and losing one
 * costs a refresh of a board somebody is looking at anyway.
 */

export interface NewOrderNotice {
  ref: string;
  customerName: string | null;
  customerPhone: string | null;
  totalPaise: number;
  deliverySlot: string;
  leadHours: number;
  /** Placed plus the lead time promised — the same arithmetic the board shows. */
  dueAt: Date;
}

export interface NotificationChannel {
  name: string;
  send(notice: NewOrderNotice): Promise<void>;
}

/**
 * The last four digits, and a shape that cannot be mistaken for a number to
 * ring. `+919876543210` becomes `\u20263210`.
 *
 * A full mobile number is the single most re-identifying thing this product
 * holds about a guest, and a log drain is not the database: it is retained on
 * somebody else's schedule, searchable by anybody with dashboard access, and
 * frequently shipped onward to a third party. Four digits is enough to match a
 * log line against the order row it names, which is the only thing this line is
 * for — the number itself is one click away in /admin for anyone who needs to
 * actually ring the customer.
 */
export function maskedPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length < 4 ? "\u2026" : `\u2026${digits.slice(-4)}`;
}

/**
 * One structured line, not a sentence.
 *
 * Log drains index JSON far better than prose, and these are the fields
 * somebody would page on: which order, when it is due, how much.
 */
const serverLog: NotificationChannel = {
  name: "server-log",
  async send(n) {
    console.info("new_order", {
      ref: n.ref,
      totalPaise: n.totalPaise,
      slot: n.deliverySlot,
      leadHours: n.leadHours,
      dueAt: n.dueAt.toISOString(),
      /* Enough to recognise the order at 8am and no more. The ref is the key
         to everything else; the board has the rest. */
      customer: n.customerName,
      phone: maskedPhone(n.customerPhone),
    });
  },
};

const channels: NotificationChannel[] = [serverLog];

/** Register another way of announcing an order. Call at module load. */
export function addChannel(channel: NotificationChannel): void {
  channels.push(channel);
}

export async function notifyNewOrder(notice: NewOrderNotice): Promise<void> {
  await Promise.all(
    channels.map((c) =>
      c.send(notice).catch((e) => {
        console.error("notify_failed", { channel: c.name, ref: notice.ref, error: String(e) });
      }),
    ),
  );
}
