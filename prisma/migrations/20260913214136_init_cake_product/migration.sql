-- CreateEnum
CREATE TYPE "CakeCategory" AS ENUM ('chocolate', 'fruit', 'cheesecake', 'nut_caramel', 'classic');

-- CreateTable
CREATE TABLE "CakeProduct" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "CakeCategory" NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "compareAtPricePaise" INTEGER,
    "weightLabel" TEXT NOT NULL,
    "isEggless" BOOLEAN NOT NULL DEFAULT true,
    "primaryImageUrl" TEXT,
    "primaryImageAlt" TEXT,
    "config" JSONB,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CakeProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CakeProduct_slug_key" ON "CakeProduct"("slug");

-- CreateIndex
CREATE INDEX "CakeProduct_isAvailable_sortOrder_idx" ON "CakeProduct"("isAvailable", "sortOrder");

-- CreateIndex
CREATE INDEX "CakeProduct_category_sortOrder_idx" ON "CakeProduct"("category", "sortOrder");
