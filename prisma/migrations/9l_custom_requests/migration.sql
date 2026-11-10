-- CreateEnum
CREATE TYPE "CustomRequestStatus" AS ENUM ('awaiting_quote', 'quoted', 'paid', 'declined', 'expired', 'no_bakery', 'cancelled');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'custom_request';

-- AlterTable
ALTER TABLE "BakerySettings" ADD COLUMN     "customMarginPct" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "NotificationOutbox" ADD COLUMN     "customRequestId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CustomRequest" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "CustomRequestStatus" NOT NULL DEFAULT 'awaiting_quote',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "sizeKg" DECIMAL(4,1) NOT NULL,
    "budgetPaise" INTEGER,
    "flavour" TEXT NOT NULL,
    "cakeMessage" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "address" JSONB NOT NULL,
    "vendorId" TEXT,
    "triedVendorIds" TEXT[],
    "offerExpiresAt" TIMESTAMP(3),
    "vendorQuotePaise" INTEGER,
    "quotePaise" INTEGER,
    "quoteExpiresAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomRequest_ref_key" ON "CustomRequest"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRequest_token_key" ON "CustomRequest"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRequest_orderId_key" ON "CustomRequest"("orderId");

-- CreateIndex
CREATE INDEX "CustomRequest_status_offerExpiresAt_idx" ON "CustomRequest"("status", "offerExpiresAt");

-- CreateIndex
CREATE INDEX "CustomRequest_phone_status_idx" ON "CustomRequest"("phone", "status");

-- CreateIndex
CREATE INDEX "NotificationOutbox_customRequestId_idx" ON "NotificationOutbox"("customRequestId");

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_customRequestId_fkey" FOREIGN KEY ("customRequestId") REFERENCES "CustomRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRequest" ADD CONSTRAINT "CustomRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRequest" ADD CONSTRAINT "CustomRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every table has RLS on (see 1_enable_rls): no policies, so Supabase's anon and
-- authenticated roles get nothing; Prisma connects as the table owner.
ALTER TABLE "CustomRequest" ENABLE ROW LEVEL SECURITY;
