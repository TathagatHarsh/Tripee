ALTER TABLE "VendorOrder" ADD COLUMN "capacityOverride" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "isBusy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preparationMinutes" INTEGER NOT NULL DEFAULT 120;

-- CreateTable
CREATE TABLE "VendorInventory" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sizeBand" TEXT NOT NULL,
    "eggType" "EggType" NOT NULL,
    "totalStock" INTEGER NOT NULL DEFAULT 0,
    "reservedStock" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "previousReserved" INTEGER NOT NULL,
    "newReserved" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalNotification" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "orderRef" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateIndex
CREATE INDEX "VendorInventory_vendorId_active_idx" ON "VendorInventory"("vendorId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "VendorInventory_vendorId_productId_sizeBand_eggType_key" ON "VendorInventory"("vendorId", "productId", "sizeBand", "eggType");

-- CreateIndex
CREATE INDEX "InventoryTransaction_inventoryId_createdAt_idx" ON "InventoryTransaction"("inventoryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_assignmentId_inventoryId_key" ON "InventoryReservation"("assignmentId", "inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalNotification_dedupeKey_key" ON "PortalNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "PortalNotification_vendorId_createdAt_idx" ON "PortalNotification"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "VendorInventory" ADD CONSTRAINT "VendorInventory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "VendorInventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VendorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "VendorInventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "PortalNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Stock is never invented or backfilled. Existing assignments remain auditable.
ALTER TABLE "VendorInventory" ADD CONSTRAINT "inventory_stock_bounds" CHECK ("totalStock" >= 0 AND "reservedStock" >= 0 AND "reservedStock" <= "totalStock" AND "lowStockThreshold" >= 0);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "reservation_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "reservation_status_valid" CHECK (status IN ('reserved', 'released', 'consumed'));
ALTER TABLE "Vendor" ADD CONSTRAINT "preparation_minutes_positive" CHECK ("preparationMinutes" > 0);
