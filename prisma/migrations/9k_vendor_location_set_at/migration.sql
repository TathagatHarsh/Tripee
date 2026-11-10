-- The bakery confirms its own pin before it can be offered orders.
ALTER TABLE "Vendor" ADD COLUMN "locationSetAt" TIMESTAMP(3);
