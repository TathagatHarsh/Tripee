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
      // The name and number are what make this actionable to a human reading
      // the log at 8am, and they are already in the same database this line is
      // about — no new exposure, just a pointer to the row.
      customer: n.customerName,
      phone: n.customerPhone,
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
