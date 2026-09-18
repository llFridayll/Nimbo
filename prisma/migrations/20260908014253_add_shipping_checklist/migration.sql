-- CreateTable
CREATE TABLE "ShippingChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipDate" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingChecklistItem_shipDate_carrier_platform_shop_sku_key" ON "ShippingChecklistItem"("shipDate", "carrier", "platform", "shop", "sku");
