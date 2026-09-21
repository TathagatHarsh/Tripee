-- Who actually bakes the cake.
--
-- The business changed shape between Phase 1 and Phase 2: Makemycake takes the
-- order, and one of a handful of partner bakeries makes it. This adds the three
-- things that were missing to say so -- a list of vendors, a record of which
-- vendor each order was handed to, and a way for a signed-in person to *be* a
-- vendor rather than a customer.
--
-- Additive and reversible in effect. No existing column changes type, gains a
-- NOT NULL or loses a default. "Order" and "UserProfile" each gain one nullable
-- column, both NULL on every row that already exists, so no foreign key added
-- here validates against anything and none of them can fail.
--
-- Nothing is backfilled and nothing is invented. Every order placed before this
-- migration has no assignment and reads as "Unassigned", which is what it was --
-- the same position migration 6 took about the confirmations that were never
-- recorded, and for the same reason: a fabricated assignment history would tell
-- the office that a bakery was rung when nobody rang anybody.
--
-- Specifically NOT touched: "OrderStatus", "OrderItem", "OrderEvent" and
-- "CatalogOption". Vendor fulfilment is a second state machine beside the
-- customer's order status, not a widening of it, and a frozen price line is not
-- a vendor's business.

-- AlterEnum
-- A fourth role, and the first that is not a rank. CUSTOMER < KITCHEN < ADMIN is
-- a ladder; a vendor is a different company and sits off it entirely. See
-- lib/roles.ts, where "allows" gives VENDOR an exact match in both directions so
-- that neither an owner nor a baker inherits a vendor's orders.
--
-- Adding a value cannot fail and cannot change an existing row: every
-- "UserProfile" already holds one of the three values that were here before.
ALTER TYPE "UserRole" ADD VALUE 'VENDOR';

-- CreateEnum
-- Deliberately a separate type from "OrderStatus". The customer is told where
-- their cake is; this says what the bakery on the other end of the phone has
-- done with it. There is no 'unassigned' -- an order no vendor holds has no row
-- in "VendorOrder" at all, and a status meaning "this row does not exist" is one
-- every query would have to remember to exclude.
CREATE TYPE "VendorOrderStatus" AS ENUM (
    'assigned', 'accepted', 'rejected', 'in_preparation', 'ready',
    'handed_over', 'withdrawn'
);

-- CreateTable
-- Short, and shaped for the office rather than for a directory: a name and the
-- three ways to ring them. "isActive" rather than deletion, for the reason
-- "CatalogOption"."isAvailable" exists -- a vendor who has ever been given an
-- order is part of that order's history, and the row has to survive being
-- withdrawn from the picker.
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- One row per assignment, never overwritten. An order offered to Vendor A and
-- refused, then given to Vendor B, is two rows -- and the first one, with its
-- reason, is the thing the office most needs when deciding who to try next. A
-- "vendorId" column on "Order" would have held only the last answer.
--
-- The seven timestamps are this table's own history, which is why there is no
-- VendorOrderEvent beside it. Each transition stamps exactly one of them (see
-- lib/vendors' STAMP), so the sequence is recoverable from the row without a
-- join and a status cannot disagree with the history of how it got there.
-- Extending "OrderEvent" instead was considered and declined: its "toStatus" is
-- an "OrderStatus" and NOT NULL, so it would have meant widening a working table
-- into a generic event log.
CREATE TABLE "VendorOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "VendorOrderStatus" NOT NULL DEFAULT 'assigned',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "handedOverAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "assignedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOrder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Which assignment is live, as a single column that can be compare-and-swapped.
--
-- The alternative -- "the newest row in VendorOrder that is not rejected" -- is
-- a race rather than a style choice: two owners assigning the same order a
-- second apart would each insert a row, each be newest, and two bakeries would
-- bake one cake. One column can be updated conditionally on the value that was
-- just read (see lib/vendorTransition), so the loser of that race writes nothing
-- and is told so.
--
-- NULL on every existing row, which is exactly what those orders are: placed
-- before there were any vendors.
ALTER TABLE "Order" ADD COLUMN "currentAssignmentId" TEXT;

-- AlterTable
-- Which vendor a person signs in as. NULL for every role that is not VENDOR,
-- and NULL on every row that exists today. This is not the authorisation -- the
-- role is -- and a vendorId on a CUSTOMER row grants nothing; lib/auth's
-- requireVendor reads both and refuses if either is missing.
ALTER TABLE "UserProfile" ADD COLUMN "vendorId" TEXT;

-- CreateIndex
-- Every read is "the vendors somebody can be given an order, by name" -- the
-- assign picker on an order, and the list at /admin/vendors.
CREATE INDEX "Vendor_isActive_name_idx" ON "Vendor"("isActive", "name");

-- CreateIndex
-- The vendor dashboard's only query, and the one that must never be able to
-- return another vendor's work: "my assignments, in these states".
CREATE INDEX "VendorOrder_vendorId_status_idx" ON "VendorOrder"("vendorId", "status");

-- CreateIndex
-- The admin order page's: "everything this order has ever been offered to,
-- oldest first".
CREATE INDEX "VendorOrder_orderId_assignedAt_idx" ON "VendorOrder"("orderId", "assignedAt");

-- CreateIndex
-- UNIQUE, and it is doing real work rather than describing a coincidence: one
-- assignment can be the live one for at most one order. It is also what turns
-- the pointer above into a lock the database enforces.
CREATE UNIQUE INDEX "Order_currentAssignmentId_key" ON "Order"("currentAssignmentId");

-- AddForeignKey
-- SET NULL. If a live assignment row ever went away the order would be
-- unassigned, which is a true statement; it must not take the order with it.
ALTER TABLE "Order" ADD CONSTRAINT "Order_currentAssignmentId_fkey"
    FOREIGN KEY ("currentAssignmentId") REFERENCES "VendorOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT, not SET NULL and not CASCADE. A vendor with assignments cannot be
-- deleted at all: deleting them would either destroy the record of who made a
-- cake or leave it pointing nowhere. This constraint is what makes "isActive"
-- the only route out, rather than a convention somebody has to remember.
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- CASCADE, for the reason migration 6 gives about an order's events: an
-- assignment is part of its order rather than a fact beside it.
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT, as above.
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, for migration 6's reason: revoking somebody's account must not erase
-- the fact that they handed a cake to a bakery.
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "UserProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, for the reason migration 1 gives: Supabase publishes a
-- PostgREST API over the public schema and the anon key is publishable. These
-- two tables are the whole point of Phase 2's access control -- one holds a
-- partner's contact details, the other says which orders each partner may see --
-- so they get the same policy-less RLS every other table here has. With no
-- policies, anon and authenticated get nothing at all through PostgREST; Prisma
-- connects as the table owner and is unaffected.
ALTER TABLE "Vendor"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorOrder" ENABLE ROW LEVEL SECURITY;
