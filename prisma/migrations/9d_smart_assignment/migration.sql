-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentState" AS ENUM ('PENDING', 'ASSIGNING', 'OFFERED', 'ASSIGNED', 'MANUAL');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "assignmentNote" TEXT,
ADD COLUMN     "assignmentState" "AssignmentState" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "assignmentFeePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commissionBps" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "fulfillsAllProducts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAcceptingOrders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "maxConcurrentOrders" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "serviceRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "supportedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "unavailableUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VendorOrder" ADD COLUMN     "assignmentStatus" "AssignmentStatus" NOT NULL DEFAULT 'OFFERED',
ADD COLUMN     "commissionPaise" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "distanceKm" DOUBLE PRECISION,
ADD COLUMN     "estimatedMinutes" DOUBLE PRECISION,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "feePaise" INTEGER,
ADD COLUMN     "offeredAt" TIMESTAMP(3),
ADD COLUMN     "orderValuePaise" INTEGER,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "routeSource" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vendorEarningPaise" INTEGER;

-- Preserve old attempts and their timestamps. Do not invent historical money.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "assignedAt", id) AS seq
  FROM "VendorOrder"
)
UPDATE "VendorOrder" v SET sequence = ranked.seq,
  "offeredAt" = v."assignedAt", "createdAt" = v."assignedAt",
  "respondedAt" = COALESCE(v."acceptedAt", v."rejectedAt"),
  "expiresAt" = CASE WHEN v.status = 'assigned' THEN CURRENT_TIMESTAMP + INTERVAL '2 minutes' ELSE NULL END,
  "assignmentStatus" = CASE
    WHEN v.status = 'rejected' THEN 'REJECTED'::"AssignmentStatus"
    WHEN v.status = 'withdrawn' THEN 'CANCELLED'::"AssignmentStatus"
    WHEN v.status = 'assigned' THEN 'OFFERED'::"AssignmentStatus"
    ELSE 'ACCEPTED'::"AssignmentStatus" END
FROM ranked WHERE ranked.id = v.id;
-- Old accepted rows that are no longer current remain historical acceptances
-- via acceptedAt, but cannot own the live acceptance constraint.
UPDATE "VendorOrder" v SET "assignmentStatus" = 'CANCELLED'
WHERE v."assignmentStatus" IN ('OFFERED', 'ACCEPTED')
AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."currentAssignmentId" = v.id);
UPDATE "Order" o SET "assignmentState" = CASE WHEN v."assignmentStatus" = 'OFFERED'
  THEN 'OFFERED'::"AssignmentState" ELSE 'ASSIGNED'::"AssignmentState" END
FROM "VendorOrder" v WHERE o."currentAssignmentId" = v.id;
-- Existing unassigned orders stay with the office until explicitly migrated.
UPDATE "Order" SET "assignmentState" = 'MANUAL', "assignmentNote" = 'Existing order: main bakery assignment required'
WHERE "currentAssignmentId" IS NULL;

-- CreateIndex
CREATE INDEX "VendorOrder_assignmentStatus_expiresAt_idx" ON "VendorOrder"("assignmentStatus", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOrder_orderId_sequence_key" ON "VendorOrder"("orderId", "sequence");


-- The database itself forbids two live offers or two winning bakeries.
CREATE UNIQUE INDEX "VendorOrder_one_live_assignment" ON "VendorOrder" ("orderId")
WHERE "assignmentStatus" IN ('OFFERED', 'ACCEPTED');
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_assignment_rules_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL OR "latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  AND "serviceRadiusKm" > 0 AND "serviceRadiusKm" <= 500
  AND "maxConcurrentOrders" >= 0 AND "commissionBps" BETWEEN 0 AND 10000 AND "assignmentFeePaise" >= 0
);
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_assignment_money_check" CHECK (
  ("vendorEarningPaise" IS NULL OR "vendorEarningPaise" >= 0)
  AND ("commissionPaise" IS NULL OR "commissionPaise" >= 0)
  AND ("feePaise" IS NULL OR "feePaise" >= 0)
  AND ("distanceKm" IS NULL OR "distanceKm" >= 0)
  AND ("estimatedMinutes" IS NULL OR "estimatedMinutes" >= 0)
);
