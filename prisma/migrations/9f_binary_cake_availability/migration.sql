-- Deploy with old stock writers/workers stopped: binary availability replaces
-- quantities. Historical columns, constraints, indexes and both legacy history
-- tables are deliberately retained, unmapped by Prisma. Do not use db push to
-- contract them. Rollback: stop new writers, deploy the prior client; retained
-- quantities are the pre-cutover snapshot and require operational reconciliation
-- for orders processed after cutover. Keep this audit when rolling back.
BEGIN;
ALTER TABLE "VendorInventory" ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT false;
UPDATE "VendorInventory" SET "isAvailable" = ("active" AND "totalStock" > "reservedStock");
CREATE INDEX "VendorInventory_vendorId_isAvailable_idx" ON "VendorInventory"("vendorId", "isAvailable");
CREATE TABLE "InventoryAvailabilityChange" (
  "id" TEXT NOT NULL,
  "inventoryId" TEXT NOT NULL,
  "previousAvailable" BOOLEAN,
  "newAvailable" BOOLEAN NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryAvailabilityChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryAvailabilityChange_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "VendorInventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryAvailabilityChange_inventoryId_createdAt_idx" ON "InventoryAvailabilityChange"("inventoryId", "createdAt");
COMMIT;
