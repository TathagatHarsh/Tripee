-- How a docket got to where it is.
--
-- Until now "Order"."status" was the whole story: moving an order overwrote the
-- previous value and bumped "updatedAt", so the board could say where a cake is
-- and never when it was confirmed, when it left, or who moved it. This adds the
-- record beside the column rather than replacing it -- "Order"."status" stays
-- the truth, and these rows stay history.
--
-- Additive and reversible in effect. No existing table gains, loses or changes
-- a column; every existing row is untouched. The table starts empty and stays
-- empty for every order placed before it existed, which is the honest state:
-- the confirmations and deliveries that were never recorded cannot be
-- reconstructed, and lib/orders' buildTimeline shows those orders only the one
-- event their own "createdAt" can prove -- that they were placed.

-- CreateTable
-- "fromStatus" is nullable so a row is readable without the row before it, and
-- so a first-ever event for an order needs no invented predecessor. "actorId"
-- is nullable because a move may be recorded for an account since revoked.
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Every read is "this order's events, oldest first" -- the timeline on
-- /admin/orders/[ref]. Nothing queries these rows any other way.
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- AddForeignKey
-- CASCADE, unlike the order's own customer link. An event is part of its order
-- rather than a fact beside it: if the order is ever deleted there is nothing
-- left for its history to be the history of.
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, for the reason migration 5 gives about "Order"."userId": removing a
-- person must not remove the fact that a cake was confirmed and went out. The
-- event survives having lost the name attached to it.
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "UserProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, for the reason migration 1 gives: Supabase publishes a
-- PostgREST API over the public schema and the anon key is publishable. These
-- rows name staff members against the orders they handled, so they get the same
-- policy-less RLS every other table here has -- anon and authenticated get
-- nothing at all through PostgREST, while Prisma connects as the table owner
-- and is unaffected.
ALTER TABLE "OrderEvent" ENABLE ROW LEVEL SECURITY;
