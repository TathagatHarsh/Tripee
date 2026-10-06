ALTER TABLE "Order" ADD COLUMN "razorpayOrderId" TEXT, ADD COLUMN "razorpayPaymentId" TEXT;
CREATE UNIQUE INDEX "Order_razorpayOrderId_key" ON "Order"("razorpayOrderId");
