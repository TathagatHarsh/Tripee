-- The catalogue comes back, this time as the thing that is actually read.
--
-- Migration 2 dropped CatalogItem because it mirrored lib/catalog.ts and
-- lib/pricing.ts and nothing ever queried it. The difference now is the reason:
-- a bakery has to be able to reprice a filling or withdraw a flavour without a
-- deploy, and the only way to do that is for these rows to be the authority.
-- lib/catalogDefaults.ts keeps the shipped values as the seed's input and as
-- the fallback for a deployment with no database; it is not read while one is
-- reachable.
--
-- Additive: "Order", "OrderItem" and "Design" are untouched, so every existing
-- order keeps the price lines it was quoted, and rolling this back is a drop.

-- CreateEnum
CREATE TYPE "CatalogCategory" AS ENUM ('shape', 'size', 'sponge', 'filling', 'frosting', 'coverage', 'finish', 'topping', 'placement', 'delivery');

-- CreateTable
CREATE TABLE "CatalogOption" (
    "id" TEXT NOT NULL,
    "category" "CatalogCategory" NOT NULL,
    "value" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "shortName" TEXT,
    "swatch" TEXT,
    "glyph" TEXT,
    "priceInputPaise" INTEGER NOT NULL,
    "multiplier" DOUBLE PRECISION,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "tierSurchargePaise" INTEGER NOT NULL,
    "layerSurchargePaise" INTEGER NOT NULL,
    "messagePipingPaise" INTEGER NOT NULL,
    "dripPaise" INTEGER NOT NULL,
    "sugarFreePaise" INTEGER NOT NULL,
    "gstBasisPoints" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Two rows for one option would make "the price of red velvet" ambiguous, and
-- which one won would come down to row order.
CREATE UNIQUE INDEX "CatalogOption_category_value_key" ON "CatalogOption"("category", "value");

-- CreateIndex
-- Every read is "this category, in display order".
CREATE INDEX "CatalogOption_category_sortOrder_idx" ON "CatalogOption"("category", "sortOrder");

-- Row-level security, for the reason migration 1 gives: Supabase publishes a
-- PostgREST API over the public schema, and the anon key is publishable. On a
-- price table the stakes are plainer than elsewhere -- without this, anyone
-- holding a public key could rewrite what the bakery charges. No policies, so
-- anon and authenticated get nothing; Prisma connects as the table owner and
-- bypasses RLS unless FORCE is set.
ALTER TABLE "CatalogOption"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PricingSettings" ENABLE ROW LEVEL SECURITY;
