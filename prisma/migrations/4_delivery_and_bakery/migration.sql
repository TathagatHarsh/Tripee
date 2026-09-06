-- Delivery promises and the letterhead, out of code and into rows.
--
-- Migration 3 moved what an option costs. This moves the other two things a
-- bakery changes without wanting a developer: how long a slot takes and how far
-- it reaches, and the name and number printed on the documents.
--
-- The delivery columns hang off CatalogOption rather than a table of their own
-- because a slot IS an option -- it is already a row there, already priced,
-- already withdrawable. Zones are a table because a zone is not an option
-- anybody picks; it is a fact about a pincode that modifies whichever slot they
-- did pick.
--
-- Additive. "Order", "OrderItem" and "Design" are untouched, existing
-- CatalogOption rows keep every value they hold, and PricingSettings gains a
-- column with a default so the singleton needs no backfill.

-- AlterTable
ALTER TABLE "CatalogOption" ADD COLUMN "leadHours" INTEGER;
ALTER TABLE "CatalogOption" ADD COLUMN "slotWindow" TEXT;
ALTER TABLE "CatalogOption" ADD COLUMN "slotNote" TEXT;

-- AlterTable
-- Zero means no minimum, which is the position this product shipped with.
ALTER TABLE "PricingSettings" ADD COLUMN "minOrderPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pincodeFrom" INTEGER NOT NULL,
    "pincodeTo" INTEGER NOT NULL,
    "extraHours" INTEGER NOT NULL,
    "slots" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BakerySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "fssaiLicence" TEXT NOT NULL DEFAULT '',
    "orderNotifyEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BakerySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Every read is "which zone holds this pincode".
CREATE INDEX "DeliveryZone_pincodeFrom_pincodeTo_idx" ON "DeliveryZone"("pincodeFrom", "pincodeTo");

-- Row-level security, for the reason the enable_rls migration gives: Supabase
-- publishes a PostgREST API over the public schema and the anon key is
-- publishable. BakerySettings carries a phone number and an address, and
-- DeliveryZone decides who can be quoted what -- neither should be writable by
-- anybody holding a public key. No policies, so anon and authenticated get
-- nothing; Prisma connects as the table owner and bypasses RLS unless FORCE is
-- set.
ALTER TABLE "DeliveryZone"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BakerySettings" ENABLE ROW LEVEL SECURITY;
