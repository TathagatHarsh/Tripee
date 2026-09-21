-- Production hardening: aggregate checkouts, immutable fulfilment and recipe
-- snapshots, durable idempotency, scheduling, vendor events, and an outbox.
-- This migration is additive apart from making the legacy single-cake config
-- nullable. Existing orders are retained and receive one explicitly marked
-- legacy cake row; no recipe or allergen information is invented.

CREATE TYPE "FulfillmentMethod" AS ENUM ('delivery', 'pickup');
CREATE TYPE "CheckoutAttemptStatus" AS ENUM ('processing', 'completed', 'failed');
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sending', 'sent', 'failed');
CREATE TYPE "NotificationKind" AS ENUM ('new_order', 'order_cancelled', 'vendor_assigned', 'status_changed');

ALTER TABLE "Order"
  ALTER COLUMN "config" DROP NOT NULL,
  ADD COLUMN "productSubtotalPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "fulfillmentMethod" "FulfillmentMethod" NOT NULL DEFAULT 'delivery',
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "landmark" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "pincode" TEXT,
  ADD COLUMN "requestedFor" TIMESTAMP(3),
  ADD COLUMN "requestedWindow" TEXT,
  ADD COLUMN "deliveryInstructions" TEXT,
  ADD COLUMN "customerNotes" TEXT,
  ADD COLUMN "occasion" TEXT,
  ADD COLUMN "deliveryZoneIdSnapshot" TEXT,
  ADD COLUMN "deliveryZoneNameSnapshot" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "dueAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;

UPDATE "Order"
SET "productSubtotalPaise" = "totalPaise",
    "recipientName" = "customerName",
    "fulfillmentMethod" = CASE WHEN "deliverySlot" = 'pickup'
      THEN 'pickup'::"FulfillmentMethod" ELSE 'delivery'::"FulfillmentMethod" END;

ALTER TABLE "Order"
  ALTER COLUMN "allergens" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "servesMin" SET DEFAULT 0,
  ALTER COLUMN "servesMax" SET DEFAULT 0,
  ADD CONSTRAINT "Order_amounts_nonnegative_check"
    CHECK ("productSubtotalPaise" >= 0 AND "deliveryFeePaise" >= 0 AND "totalPaise" >= 0 AND "payablePaise" >= 0),
  ADD CONSTRAINT "Order_delivery_pincode_check"
    CHECK ("fulfillmentMethod" = 'pickup' OR "pincode" IS NULL OR "pincode" ~ '^[0-9]{6}$');

ALTER TABLE "CatalogOption"
  ADD COLUMN "dailyCapacity" INTEGER,
  ADD COLUMN "cutoffHours" INTEGER,
  ADD CONSTRAINT "CatalogOption_capacity_positive_check" CHECK ("dailyCapacity" IS NULL OR "dailyCapacity" > 0),
  ADD CONSTRAINT "CatalogOption_cutoff_nonnegative_check" CHECK ("cutoffHours" IS NULL OR "cutoffHours" >= 0);

ALTER TABLE "CakeProduct" ADD COLUMN "productionSpec" JSONB;

-- Legacy catalogue products without an explicit recipe remain visible to the
-- owner but cannot be newly ordered. Seeded products are safely backfilled by
-- prisma/seedCakes.ts from their authored preset configuration.
UPDATE "CakeProduct"
SET "isAvailable" = false
WHERE "productionSpec" IS NULL AND "config" IS NULL;

CREATE TABLE "OrderCake" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "config" JSONB,
  "priceBreakdown" JSONB NOT NULL,
  "totalPaise" INTEGER NOT NULL,
  "cakeProductId" TEXT,
  "cakeName" TEXT,
  "cakeImageUrl" TEXT,
  "variantLabel" TEXT,
  "allergens" TEXT[] NOT NULL,
  "servesMin" INTEGER NOT NULL,
  "servesMax" INTEGER NOT NULL,
  "productionSpec" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderCake_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderCake_total_nonnegative_check" CHECK ("totalPaise" >= 0),
  CONSTRAINT "OrderCake_servings_check" CHECK ("servesMin" >= 0 AND "servesMax" >= "servesMin")
);

INSERT INTO "OrderCake" (
  "id", "orderId", "position", "config", "priceBreakdown", "totalPaise",
  "cakeProductId", "cakeName", "cakeImageUrl", "variantLabel", "allergens",
  "servesMin", "servesMax", "productionSpec", "createdAt"
)
SELECT gen_random_uuid()::text, o."id", 0, o."config", o."priceBreakdown", o."totalPaise",
       o."cakeProductId", o."cakeName", o."cakeImageUrl", NULL, o."allergens",
       o."servesMin", o."servesMax",
       jsonb_build_object(
         'version', 1,
         'ingredients', jsonb_build_array('Legacy order — consult the original production docket'),
         'allergens', to_jsonb(o."allergens"),
         'dietaryClaims', '[]'::jsonb,
         'kitchenInstructions', 'Production specification was not captured digitally for this legacy order.',
         'preparationNotes', NULL,
         'allergenStatementReviewed', false
       ),
       o."createdAt"
FROM "Order" o;

CREATE UNIQUE INDEX "OrderCake_orderId_position_key" ON "OrderCake"("orderId", "position");
CREATE INDEX "OrderCake_cakeProductId_idx" ON "OrderCake"("cakeProductId");
ALTER TABLE "OrderCake" ADD CONSTRAINT "OrderCake_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCake" ADD CONSTRAINT "OrderCake_cakeProductId_fkey"
  FOREIGN KEY ("cakeProductId") REFERENCES "CakeProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CheckoutAttempt" (
  "id" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" "CheckoutAttemptStatus" NOT NULL DEFAULT 'processing',
  "orderId" TEXT,
  "response" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CheckoutAttempt_orderId_key" ON "CheckoutAttempt"("orderId");
CREATE INDEX "CheckoutAttempt_status_updatedAt_idx" ON "CheckoutAttempt"("status", "updatedAt");
CREATE INDEX "CheckoutAttempt_expiresAt_idx" ON "CheckoutAttempt"("expiresAt");
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VendorOrderEvent" (
  "id" TEXT NOT NULL,
  "vendorOrderId" TEXT NOT NULL,
  "fromStatus" "VendorOrderStatus",
  "toStatus" "VendorOrderStatus" NOT NULL,
  "actorId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorOrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VendorOrderEvent_vendorOrderId_createdAt_idx" ON "VendorOrderEvent"("vendorOrderId", "createdAt");
ALTER TABLE "VendorOrderEvent" ADD CONSTRAINT "VendorOrderEvent_vendorOrderId_fkey"
  FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FulfillmentBlackout" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "method" "FulfillmentMethod" NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FulfillmentBlackout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FulfillmentBlackout_date_method_key" ON "FulfillmentBlackout"("date", "method");
CREATE INDEX "FulfillmentBlackout_date_idx" ON "FulfillmentBlackout"("date");

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "vendorId" TEXT,
  "kind" "NotificationKind" NOT NULL,
  "channel" TEXT NOT NULL,
  "destination" TEXT,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_status_availableAt_idx" ON "NotificationOutbox"("status", "availableAt");
CREATE INDEX "NotificationOutbox_orderId_createdAt_idx" ON "NotificationOutbox"("orderId", "createdAt");
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "RateLimitBucket_count_nonnegative_check" CHECK ("count" >= 0)
);
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

CREATE INDEX "Order_requestedFor_deliverySlot_status_idx" ON "Order"("requestedFor", "deliverySlot", "status");

ALTER TABLE "DeliveryZone"
  ADD CONSTRAINT "DeliveryZone_pincode_range_check"
  CHECK ("pincodeFrom" BETWEEN 100000 AND 999999 AND "pincodeTo" BETWEEN 100000 AND 999999 AND "pincodeFrom" <= "pincodeTo");

-- Active ranges may not overlap. The migration intentionally fails with the
-- conflicting rows if existing data is ambiguous instead of silently choosing
-- a winner and changing serviceability.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_active_range_excl"
  EXCLUDE USING gist (int4range("pincodeFrom", "pincodeTo", '[]') WITH &&)
  WHERE ("isActive");

ALTER TABLE "OrderCake" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckoutAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorOrderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FulfillmentBlackout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
