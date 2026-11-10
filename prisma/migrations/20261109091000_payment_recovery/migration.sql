CREATE TABLE "PaymentRecovery" (
 "id" TEXT PRIMARY KEY, "request" JSONB NOT NULL, "userId" TEXT, "payloadHash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "lastError" TEXT,
 "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PaymentRecovery_status_nextCheckAt_idx" ON "PaymentRecovery"("status", "nextCheckAt");
CREATE TABLE "RefundOperation" (
 "paymentId" TEXT PRIMARY KEY, "refundId" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "lastError" TEXT,
 "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RefundOperation_status_nextCheckAt_idx" ON "RefundOperation"("status", "nextCheckAt");
