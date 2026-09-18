-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shopId" TEXT;
ALTER TABLE "Order" ADD COLUMN "shopName" TEXT;

-- CreateIndex
CREATE INDEX "Order_shopId_idx" ON "Order"("shopId");
