import type { VendorOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { migrateConfig, type CakeConfig } from "@/lib/schema";
import { VENDOR_OPEN } from "@/lib/vendors";

/**
 * The two reads a bakery is allowed to make, and the shape of what comes back.
 *
 * **Every query in this file takes `vendorId` as its first argument and puts it
 * in the WHERE.** That is the access control, and it is a positive scope rather
 * than a filter: another bakery's assignment is not found, not found-then-
 * refused. Nothing is fetched and narrowed afterwards, so there is no moment at
 * which this process is holding a row it must not show.
 *
 * The `vendorId` itself is never a parameter of a *request*. It comes from
 * lib/auth's `requireVendor`, which reads it off the signed-in person's profile
 * row — see the note there on why "there is no value to validate" is stronger
 * than validating one.
 *
 * ## What is selected, and what is deliberately not
 *
 * A vendor gets what it takes to make and hand over the cake: the reference, the
 * customer's name and the delivery promise, the cake's specification, the
 * message piped on it and the allergens. They do **not** get `totalPaise`, the
 * `OrderItem` price lines, `paymentStatus` or the customer's phone number.
 * Those are the shop's commercial relationship with its customer, and a partner
 * bakery has no use for any of them.
 *
 * This is a select list rather than an omission, which is the part that has to
 * stay true: a column added to Order tomorrow does not silently appear on a
 * vendor's screen, because nothing here reads `*`.
 *
 * The phone number is the one worth stating out loud: leaving it out is not an
 * oversight but the arrangement — the shop rings the customer, and the bakery
 * rings the shop.
 *
 * The **delivery pincode does** reach them, through the cake's own config and
 * the spec sheet rendered from it. That is deliberate: it is an area rather than
 * an address, it is what the quoted lead time was computed from, and it is on
 * the sheet the kitchen has always worked from. A bakery that cannot see when
 * and roughly where a cake has to be cannot promise it.
 */

/**
 * Fields shared by the list and the detail, so the two cannot diverge.
 *
 * `cakeName`, `cakeImageUrl` and `config` are the §9 additions, and all three
 * are **frozen order data** rather than a join to CakeProduct. That is the whole
 * reason they are columns: a bakery holding a cake must see the cake that was
 * sold, not the row an owner renamed and rephotographed this morning. §10 says
 * so in as many words, and §35 makes it a rule for the whole product.
 *
 * `config` reaches the board as well as the detail now. It costs one JSONB
 * column on a handful of rows and it buys the two things a card is useless
 * without: the size the cake has to be, and the message piped on it. Every page
 * runs it through `migrateConfig` and none of them trusts it to parse.
 */
const ORDER_FOR_VENDOR = {
  ref: true,
  customerName: true,
  deliverySlot: true,
  leadHours: true,
  createdAt: true,
  requestedFor: true,
  dueAt: true,
  confirmedAt: true,
  requestedWindow: true,
  customerNotes: true,
  cakes: { orderBy: { position: "asc" }, select: { id: true, cakeName: true, variantLabel: true, allergens: true, productionSpec: true, config: true } },
  allergens: true,
  servesMin: true,
  servesMax: true,
  cakeName: true,
  cakeImageUrl: true,
  config: true,
} as const;

/**
 * Everything this bakery is currently holding, soonest due first.
 *
 * Open assignments only — `VENDOR_OPEN` is derived from the state machine, so
 * this is "anything still needing them" rather than a list of statuses somebody
 * has to remember to keep in step. What they have finished or declined is
 * history, and a dashboard that keeps showing it is a dashboard nobody can read
 * at 7am.
 */
export async function vendorBoard(vendorId: string): Promise<VendorCard[]> {
  const rows = await db.vendorOrder.findMany({
    where: { vendorId, status: { in: VENDOR_OPEN } },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      order: { select: ORDER_FOR_VENDOR },
    },
  });
  return rows.map(toCard);
}

/**
 * The order fields a card shows, written out rather than inferred.
 *
 * Spelled as an interface instead of derived from the Prisma select above,
 * because the derivation is the kind of type that is clever on the day it is
 * written and unreadable in the stack trace six months later. The select and
 * this list are checked against each other by the compiler at the one place they
 * meet — `toCard` — so they cannot drift silently.
 */
export interface VendorCardOrder {
  ref: string;
  customerName: string | null;
  deliverySlot: string;
  leadHours: number;
  createdAt: Date;
  requestedFor: Date | null;
  dueAt: Date | null;
  confirmedAt: Date | null;
  requestedWindow: string | null;
  customerNotes: string | null;
  cakes: { id: string; cakeName: string | null; variantLabel: string | null; allergens: string[]; productionSpec: unknown; config: unknown }[];
  allergens: string[];
  servesMin: number;
  servesMax: number;
  /** `Order.cakeName` — what this cake was called when it was sold. */
  cakeName: string | null;
  /** `Order.cakeImageUrl` — the photograph as it was then. */
  cakeImageUrl: string | null;
}

/** One card on the board, with its cake already parsed out of the stored JSON. */
export interface VendorCard {
  id: string;
  status: VendorOrderStatus;
  assignedAt: Date;
  order: VendorCardOrder;
  /** Null when the stored specification no longer validates. Every card says so. */
  config: CakeConfig | null;
}

/**
 * Split the stored JSON off the row and parse it once, here.
 *
 * Done in the data layer rather than in each page because there are now three
 * screens reading these rows — the board, the history list and the ticket — and
 * a config parsed in three places is three chances to disagree about what an
 * unreadable one means. `migrateConfig` returns null for a config this build
 * cannot read, which is a real state every caller renders in words.
 */
function toCard(row: {
  id: string;
  status: VendorOrderStatus;
  assignedAt: Date;
  order: VendorCardOrder & { config: unknown };
}): VendorCard {
  const { config, ...order } = row.order;
  return { id: row.id, status: row.status, assignedAt: row.assignedAt, order, config: migrateConfig(config) };
}

/**
 * Everything this bakery has ever been handed, newest first.
 *
 * The board above answers "what do I make now" and deliberately drops anything
 * finished or declined. This is the other question — "what did I do last week",
 * "did I decline that one" — and it is a separate read rather than a filter on
 * the board because the two want opposite orderings: the board is soonest-due
 * first because it is a queue, and this is newest-assigned first because it is a
 * log.
 *
 * Capped, because a history page is read to find something recent and a bakery
 * three years in should not be served three years of rows to do it.
 */
export async function vendorHistory(vendorId: string, take = 60): Promise<VendorCard[]> {
  const rows = await db.vendorOrder.findMany({
    where: { vendorId },
    orderBy: { assignedAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      assignedAt: true,
      order: { select: ORDER_FOR_VENDOR },
    },
  });
  return rows.map(toCard);
}

/**
 * One assignment, by the order reference the bakery has in front of them.
 *
 * Newest first, because a bakery given an order, having declined it, and given
 * it again has two rows — and the live one is the recent one. The older row is
 * still readable here on purpose: a vendor looking at something they declined
 * last week should see that they declined it, not a 404.
 *
 * Returns null for an order that is not theirs, which is what the page turns
 * into `notFound()`. A 404 rather than a refusal here, unlike the portal doors:
 * this is not "you may not see this bakery's orders", it is "this is not one of
 * your orders", and a page that distinguished the two would confirm the
 * existence of another bakery's references to anybody typing them in.
 */
export async function vendorOrder(vendorId: string, ref: string) {
  const assignment = await db.vendorOrder.findFirst({
    where: { vendorId, order: { ref } },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      acceptedAt: true,
      rejectedAt: true,
      startedAt: true,
      readyAt: true,
      handedOverAt: true,
      withdrawnAt: true,
      rejectionReason: true,
      order: { select: ORDER_FOR_VENDOR },
    },
  });

  if (!assignment) return null;

  /* A stored config that no longer validates is a real state, not an error —
     lib/schema's migrateConfig returns null for one, and the page says so in
     words. Everything operational is a column and survives it. */
  const { config, ...order } = assignment.order;
  return { ...assignment, order, config: migrateConfig(config) };
}
