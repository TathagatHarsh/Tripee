-- Bakery onboarding: invite links, setup checklist, timed cake pauses.
ALTER TABLE "Vendor" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN "detailsConfirmedAt" TIMESTAMP(3);
ALTER TABLE "VendorInventory" ADD COLUMN "pausedUntil" TIMESTAMP(3);
ALTER TABLE "InventoryAvailabilityChange" ADD COLUMN "pausedUntil" TIMESTAMP(3);

CREATE UNIQUE INDEX "Vendor_inviteTokenHash_key" ON "Vendor"("inviteTokenHash");

-- Bakeries already live count as having confirmed their details.
UPDATE "Vendor" SET "detailsConfirmedAt" = now() WHERE "isActive" = true;
