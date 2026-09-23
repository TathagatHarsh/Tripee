import { DeliveryAddressSnapshot } from "@/components/DeliveryAddressSnapshot";
import Link from "next/link";
import type { Metadata } from "next";
import type { Order, OrderStatus } from "@prisma/client";
import { SignOutButton } from "@clerk/nextjs";
import { getViewer, getViewerEmail, requireKitchen } from "@/lib/auth";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import type { CatalogSnapshot } from "@/lib/catalogSnapshot";
import { renderSpecSheet } from "@/lib/docket";
import { formatINR, titleCase } from "@/lib/format";
import { ACTION_LABEL, dueAt, HAPPY_PATH, STATUS_LABEL } from "@/lib/orders";
import { priceCake } from "@/lib/pricing";
import { migrateConfig } from "@/lib/schema";
import { advanceOrder } from "./actions";

/**
 * The board the kitchen works from.
 *
 * The third of the three interfaces, and the one with the least in common with
 * the other two. §29 and §30 ask for it explicitly: no sidebar, no SaaS
 * chrome, high contrast, large everything, minimal decoration. The reason is a
 * metre of distance — this is read standing up, across a bench, by somebody
 * whose hands are covered in frosting and who needs one question answered:
 * what do I make next, and when is it due.
 *
 * So it is dark, it is a Kanban board, and the smallest text on it is 13px. The
 * `k-` palette in app/globals.css is its own, near-black rather than the
 * admin's navy, because at kitchen screen brightness in a room with a window a
 * dark ground is what survives. The status colours are lifted versions of the
 * admin's — same meanings, so somebody who works both screens learns one
 * language.
 *
 * ## The columns are the state machine, not a second one
 *
 * §31 asks for exactly this and it is worth being precise about how it is
 * satisfied: the columns are `HAPPY_PATH` from lib/orders, which is itself
 * walked out of `NEXT_STATUS`, minus the terminal state. There is no
 * board-only status, no "ready" column — there is no `ready` in the Prisma
 * enum, and inventing one is the second status system §31 forbids — and no
 * front-end state of any kind. Add a state between the kitchen and the road and
 * this board grows a column with no edit here.
 *
 * The moves are the same `advanceOrder` action as before, which calls the same
 * `applyStatusTransition` the admin portal's order page calls. §32's sync is
 * therefore not a feature — it is the absence of one. Both screens read
 * `Order.status` and both write through one function, so there is nothing to
 * keep in step.
 *
 * ## No JavaScript
 *
 * Every control is a plain form POST. Not out of principle: a board on a wall
 * tablet that has been open since 6am, on kitchen wifi, is the worst place in
 * this product for hydration to matter, and a `<form>` that works before any
 * bundle arrives is the version that is never broken.
 *
 * ## Who gets in
 *
 * This page lists customer names and phone numbers, so it has never been
 * public. A Clerk session and a KITCHEN role in UserProfile — a real person,
 * named in the header, revocable one account at a time. ADMIN passes too,
 * because a rank rather than a set is what lib/roles keeps.
 *
 * There is no /kitchen layout, so the guard is here in the page, and a second
 * one is at the top of the only action this board can invoke. A Server Action
 * does not re-run its page.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kitchen — Makemycake",
  robots: { index: false, follow: false },
};

/**
 * The work columns: the forward path, minus the end of it.
 *
 * `delivered` is dropped because a delivered cake is not work — it is history,
 * and it gets a count in the header rather than a column of cards nobody will
 * touch again. `cancelled` is not on the board at all, for the same reason.
 */
const COLUMNS: OrderStatus[] = HAPPY_PATH.filter((s) => s !== "delivered");

/** What each column means to somebody at the bench, under its own heading. */
const COLUMN_NOTE: Partial<Record<OrderStatus, string>> = {
  draft: "Nobody has rung the customer yet. Not started.",
  confirmed: "Agreed and booked in. Ready to start.",
  in_kitchen: "Being baked and finished now.",
  out_for_delivery: "Left the kitchen. On the road.",
};

/** The colour each column's cards carry. See the `k-` tokens in globals.css. */
const COLUMN_TONE: Record<string, { bar: string; text: string; ring: string }> = {
  draft: { bar: "bg-k-faint", text: "text-k-muted", ring: "border-k-line" },
  confirmed: { bar: "bg-k-next", text: "text-k-next", ring: "border-k-next/40" },
  in_kitchen: { bar: "bg-k-now", text: "text-k-now", ring: "border-k-now/40" },
  out_for_delivery: { bar: "bg-k-done", text: "text-k-done", ring: "border-k-done/40" },
};

const FALLBACK_TONE = { bar: "bg-k-faint", text: "text-k-muted", ring: "border-k-line" };

export default async function KitchenBoard() {
  // First statement, and never inside a try: this refuses by throwing.
  await requireKitchen();

  const [email, viewer] = await Promise.all([getViewerEmail(), getViewer()]);
  const isAdmin = viewer?.profile.role === "ADMIN";

  if (!hasDatabase()) {
    return (
      <Shell who={email} isAdmin={isAdmin} done={0} late={0}>
        <p className="rounded-lg border border-k-line bg-k-panel px-5 py-4 text-k-body leading-relaxed text-k-muted">
          {NO_DATABASE_MESSAGE}
        </p>
      </Shell>
    );
  }

  const now = new Date();

  const [orders, doneRecently, catalog] = await Promise.all([
    db.order.findMany({
      /*
       * Only the four live states are fetched. The board used to load two
       * hundred of everything, including every cake delivered since the shop
       * opened, and then leave the filtering to whoever was scrolling — so the
       * cancelled orders of three months ago competed for the same pixels as
       * tomorrow morning's wedding cake.
       */
      where: { status: { in: COLUMNS } },
      /*
       * Soonest due first cannot be an `orderBy` — due is
       * `createdAt + leadHours`, per row — so it is sorted below. Ordering by
       * `createdAt` here keeps the sort stable and means a board with more than
       * two hundred live dockets truncates at the newest rather than
       * arbitrarily.
       */
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    /* A count, not the rows: "9 finished in the last 12 hours" is worth knowing
       at a glance and nine cards of finished work are not. */
    db.order.count({
      where: {
        status: "delivered",
        updatedAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      },
    }),
    getCatalogSnapshot(),
  ]);

  const cards = orders
    .map((o) => ({ order: o, due: dueAt(o) }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const late = cards.filter((c) => c.due < now).length;

  return (
    <Shell who={email} isAdmin={isAdmin} done={doneRecently} late={late}>
      {cards.length === 0 ? (
        <div className="rounded-lg border border-k-line bg-k-panel px-6 py-12 text-center">
          <p className="text-k-item font-semibold text-k-ink">Nothing on the board.</p>
          <p className="mt-1.5 text-k-body text-k-muted">
            Every docket is finished or cancelled. New orders appear here the moment
            they are placed.
          </p>
        </div>
      ) : (
        /*
         * Four columns on a wide screen, and a stack of labelled sections on
         * anything narrower. Deliberately not a horizontally scrolling board on
         * a phone: four columns of cards this size on a 390px screen is one
         * column you cannot read and three you cannot find, and a baker holding
         * a phone is checking one order rather than surveying the day.
         */
        <div className="grid gap-4 xl:grid-cols-4">
          {COLUMNS.map((status) => {
            const inColumn = cards.filter((c) => c.order.status === status);
            const tone = COLUMN_TONE[status] ?? FALLBACK_TONE;

            return (
              <section key={status} className="flex min-w-0 flex-col gap-3">
                <header className="sticky top-[4.25rem] z-10 rounded-lg border border-k-line bg-k-panel/95 px-3.5 py-2.5 backdrop-blur">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className={`text-k-col font-bold uppercase tracking-[0.04em] ${tone.text}`}>
                      {STATUS_LABEL[status]}
                    </h2>
                    <span className="text-k-item font-bold tabular-nums text-k-ink">
                      {inColumn.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-k-meta text-k-faint">{COLUMN_NOTE[status]}</p>
                </header>

                {inColumn.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-k-line px-3.5 py-5 text-center text-k-meta text-k-faint">
                    Empty
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {inColumn.map((c) => (
                      <DocketCard
                        key={c.order.id}
                        order={c.order}
                        due={c.due}
                        now={now}
                        catalog={catalog}
                        tone={tone}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

/* ══════════════════════════════════════════════════════════ one docket */

function DocketCard({
  order,
  due,
  now,
  catalog,
  tone,
  isAdmin,
}: {
  order: Order;
  due: Date;
  now: Date;
  catalog: CatalogSnapshot;
  tone: { bar: string; text: string; ring: string };
  isAdmin: boolean;
}) {
  const config = migrateConfig(order.config);

  /*
   * The stored total is the number the customer was quoted and is frozen. The
   * sheet below is regenerated from the config, so if the catalogue has been
   * edited since, the two disagree — and the kitchen needs to know which one it
   * is holding to. This used to require a redeploy to happen; now it takes one
   * admin and one afternoon, so the check earns its keep.
   */
  const recomputed = config ? priceCake(config, catalog).total : null;
  const drifted = recomputed !== null && recomputed !== order.totalPaise;

  const late = due < now;
  /* Hours until due, negative once it has gone. Rounded, because a bench does
     not need minutes and "in 3h" is read faster than a timestamp. */
  const hours = Math.round((due.getTime() - now.getTime()) / 3600_000);
  const nextMove = HAPPY_PATH[HAPPY_PATH.indexOf(order.status) + 1];

  return (
    <li
      className={[
        "overflow-hidden rounded-lg border-2 bg-k-panel",
        late ? "border-k-late" : tone.ring,
      ].join(" ")}
    >
      {/* ── the two things read from furthest away ─────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3.5 pb-2 pt-3">
        <span className="font-a-mono text-k-ref font-bold leading-none tracking-[0.02em] text-k-ink">
          {order.ref}
        </span>
        <span className="text-k-body font-semibold tabular-nums text-k-muted">
          {formatINR(order.totalPaise)}
        </span>
      </div>

      {/* ── the deadline ───────────────────────────────────────────────── */}
      <div
        className={[
          "flex flex-wrap items-baseline justify-between gap-x-3 px-3.5 pb-3",
          late ? "text-k-late" : "text-k-ink",
        ].join(" ")}
      >
        <span className="text-k-due font-bold leading-none tabular-nums">
          {hours === 0 ? "Due now" : late ? `${Math.abs(hours)}h late` : `in ${hours}h`}
        </span>
        <span className="text-k-meta text-k-muted">
          {titleCase(order.deliverySlot)}
          {order.pincode ? ` · ${order.pincode}` : ""}
        </span>
      </div>

      {/* A solid bar in the column's colour, so a card's state is legible from
          across the room even where a 2px border is not. */}
      <div aria-hidden="true" className={`h-1 ${late ? "bg-k-late" : tone.bar}`} />

      {/* ── allergens: the one thing that must never be missed ─────────── */}
      {order.fulfillmentMethod === "delivery" && <details className="my-4 text-sm">
        <summary className="min-h-11 cursor-pointer">Delivery address</summary>
        <p>{order.recipientName ?? order.customerName}</p>
        <p>{[order.addressLine1, order.addressLine2, order.city, order.state, order.pincode].filter(Boolean).join(", ")}</p>
        {order.landmark && <p>Landmark: {order.landmark}</p>}
        {order.deliveryInstructions && <p>Instructions: {order.deliveryInstructions}</p>}
        <DeliveryAddressSnapshot value={order.deliveryLocation} />
      </details>}
      {order.allergens.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-2 border-b border-k-line bg-k-late/15 px-3.5 py-2">
          <span className="text-k-meta font-bold uppercase tracking-[0.08em] text-k-late">
            Contains
          </span>
          <span className="text-k-body font-semibold text-k-ink">
            {order.allergens.join(", ")}
          </span>
        </p>
      )}

      {/* ── who it is for ──────────────────────────────────────────────── */}
      <div className="border-b border-k-line px-3.5 py-2.5">
        <p className="text-k-body font-semibold text-k-ink">
          {order.customerName ?? "No name taken"}
        </p>
        {order.customerPhone ? (
          <a
            href={`tel:${order.customerPhone.replace(/[^\d+]/g, "")}`}
            className="font-a-mono text-k-body tabular-nums text-k-next underline decoration-k-next/40 underline-offset-2"
          >
            {order.customerPhone}
          </a>
        ) : (
          <p className="text-k-meta text-k-faint">No number on this order</p>
        )}
        <p className="mt-0.5 text-k-meta text-k-muted">
          Serves {order.servesMin}–{order.servesMax}
        </p>
      </div>

      {/* ── the specification ──────────────────────────────────────────── */}
      {config ? (
        /*
         * The same `renderSpecSheet` the customer downloads and the admin's
         * order page shows. Already the artifact a kitchen works from, already
         * tested — printing a second, subtly different summary beside it is how
         * two documents drift apart.
         *
         * Open by default, unlike a disclosure on an admin table: a baker
         * standing at the board wants the spec, not a control that reveals it.
         */
        <details open className="border-b border-k-line">
          <summary className="cursor-pointer list-none px-3.5 py-2 text-k-meta font-bold uppercase tracking-[0.08em] text-k-faint hover:text-k-muted [&::-webkit-details-marker]:hidden">
            Specification
          </summary>
          <pre className="a-scroll-x bg-k-panel-2 px-3.5 py-3 font-a-mono text-k-meta leading-[1.7] text-k-ink">
{renderSpecSheet(config, catalog, { ref: order.ref, createdAt: order.createdAt })}
          </pre>
        </details>
      ) : (
        <p className="border-b border-k-line bg-k-late/15 px-3.5 py-2.5 text-k-body font-semibold text-k-late">
          This order&rsquo;s saved configuration cannot be read. Do not guess — ring
          the customer and write it down.
        </p>
      )}

      {drifted && (
        <p className="border-b border-k-line px-3.5 py-2 text-k-meta leading-relaxed text-k-muted">
          The catalogue has changed since this was quoted. The{" "}
          <span className="font-semibold text-k-ink">{formatINR(order.totalPaise)}</span> above
          is what the customer agreed to and is what stands; the sheet is drawn
          against today&rsquo;s prices, so it says {formatINR(recomputed!)}.
        </p>
      )}

      {/* ── the next action, and nothing else ──────────────────────────── */}
      <div className="flex flex-col gap-2 px-3.5 py-3">
        {nextMove ? (
          <form action={advanceOrder}>
            <input type="hidden" name="ref" value={order.ref} />
            <input type="hidden" name="to" value={nextMove} />
            {/*
              One button, the whole width of the card. §30 asks for easy touch
              interaction and this is what that means on a board: the forward
              move is what anybody presses ninety-nine times out of a hundred,
              so it is a 56px target the size of the card rather than one of
              four buttons in a row.

              Cancelling is deliberately absent. lib/orders allows it from every
              live state, but a cancellation is a conversation with a customer
              and a decision about money — the admin portal's order page has it,
              behind a confirmation, and a board where the button next to "Start
              baking" cancels the order is a board that cancels orders.
            */}
            <button
              type="submit"
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-k-ink px-4 text-k-item font-bold text-k-ground transition-colors hover:bg-white active:bg-white"
            >
              {ACTION_LABEL[nextMove]}
            </button>
          </form>
        ) : (
          <p className="text-k-meta text-k-faint">Nothing further from here.</p>
        )}

        {isAdmin && (
          /* Only the owner gets the link out, because only the owner can open
             what is on the other side of it. A baker following it would land on
             /account being told the portal is the owner's — a dead end dressed
             up as a link. */
          <Link
            href={`/admin/orders/${order.ref}`}
            className="text-center text-k-meta text-k-muted underline decoration-k-line underline-offset-2 hover:text-k-ink"
          >
            Open in the admin portal
          </Link>
        )}
      </div>
    </li>
  );
}

/* ══════════════════════════════════════════════════════════ the frame */

/**
 * The board's own chrome, and there is deliberately very little of it.
 *
 * §29 is explicit that the admin's sidebar must not come here if it makes
 * kitchen work slower, and it would: a 240px column of navigation on a board
 * whose entire content is four columns of cards costs a column of cards. So the
 * header is one row — what is late, what has finished, who is signed in — and
 * there is no navigation at all beyond signing out.
 */
function Shell({
  children,
  who,
  isAdmin,
  done,
  late,
}: {
  children: React.ReactNode;
  who: string | null;
  isAdmin: boolean;
  done: number;
  late: number;
}) {
  return (
    /* `k-root` is what opts this page out of the storefront's paper grain and
       onto the dark ground — see app/globals.css. */
    <div className="k-root min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-k-line bg-k-ground/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2.5">
            <span className="text-k-item font-bold uppercase tracking-[0.1em] text-k-ink">
              Kitchen
            </span>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-k-line-strong" />
            <span className="text-k-meta uppercase tracking-[0.1em] text-k-faint">
              Production board
            </span>
          </div>

          {late > 0 && (
            <p
              role="status"
              className="rounded-md bg-k-late/20 px-2.5 py-1 text-k-body font-bold text-k-late"
            >
              {late} past {late === 1 ? "its" : "their"} window
            </p>
          )}

          <p className="text-k-meta text-k-muted">{done} finished in the last 12 hours</p>

          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            {isAdmin && (
              <Link
                href="/admin"
                className="text-k-meta text-k-muted underline decoration-k-line underline-offset-2 hover:text-k-ink"
              >
                Admin portal
              </Link>
            )}
            {/* Who is holding this session. On a tablet screwed to a wall in a
                shared kitchen, this is the half that matters. */}
            <span className="font-a-mono text-k-meta text-k-faint">{who}</span>
            <SignOutButton redirectUrl="/">
              <button
                type="button"
                className="min-h-11 rounded-md border border-k-line-strong px-3.5 text-k-meta font-semibold uppercase tracking-[0.08em] text-k-muted transition-colors hover:border-k-ink hover:text-k-ink"
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>
      </header>

      <main id="main" className="px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  );
}
