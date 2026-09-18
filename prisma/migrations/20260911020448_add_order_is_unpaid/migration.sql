-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "platformOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "buyerUsername" TEXT,
    "buyerRegion" TEXT,
    "totalAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "orderDate" DATETIME NOT NULL,
    "shippingCarrier" TEXT,
    "trackingNumber" TEXT,
    "shippingStatus" TEXT,
    "printedAt" DATETIME,
    "shopId" TEXT,
    "shopName" TEXT,
    "isUnpaid" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Order" ("buyerName", "buyerPhone", "buyerRegion", "buyerUsername", "createdAt", "currency", "id", "orderDate", "platform", "platformOrderId", "printedAt", "rawPayload", "shippingCarrier", "shippingStatus", "shopId", "shopName", "status", "totalAmount", "trackingNumber", "updatedAt") SELECT "buyerName", "buyerPhone", "buyerRegion", "buyerUsername", "createdAt", "currency", "id", "orderDate", "platform", "platformOrderId", "printedAt", "rawPayload", "shippingCarrier", "shippingStatus", "shopId", "shopName", "status", "totalAmount", "trackingNumber", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_shopId_idx" ON "Order"("shopId");
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");
CREATE INDEX "Order_buyerPhone_idx" ON "Order"("buyerPhone");
CREATE UNIQUE INDEX "Order_platform_platformOrderId_key" ON "Order"("platform", "platformOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
