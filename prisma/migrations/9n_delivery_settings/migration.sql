-- Delivery rules (ASAP / scheduled slots): one singleton row, editable later.
CREATE TABLE "DeliverySettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "feePaise" INTEGER NOT NULL DEFAULT 15000,
  "ordersFrom" TEXT NOT NULL DEFAULT '08:00',
  "ordersUntil" TEXT NOT NULL DEFAULT '18:00',
  "readyMinMinutes" INTEGER NOT NULL DEFAULT 120,
  "readyMaxMinutes" INTEGER NOT NULL DEFAULT 240,
  "customMinMinutes" INTEGER NOT NULL DEFAULT 180,
  "customMaxMinutes" INTEGER NOT NULL DEFAULT 240,
  "windowMinutes" INTEGER NOT NULL DEFAULT 120,
  "preorderDays" INTEGER NOT NULL DEFAULT 14,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliverySettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DeliverySettings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Withdraw the legacy slots from new orders; rows stay so past orders still render and price.
UPDATE "CatalogOption" SET "isAvailable" = false
  WHERE "category" = 'delivery'::"CatalogCategory" AND "value" IN ('standard','same-day','express-4hr','midnight');

-- No policies, on purpose: see 1_enable_rls.
ALTER TABLE "DeliverySettings" ENABLE ROW LEVEL SECURITY;
