/*
  Warnings:

  - You are about to drop the column `carrier` on the `ShippingChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `platform` on the `ShippingChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `shop` on the `ShippingChecklistItem` table. All the data in the column will be lost.
  - Added the required column `orderId` to the `ShippingChecklistItem` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShippingChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipDate" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShippingChecklistItem" ("checked", "id", "shipDate", "sku", "updatedAt") SELECT "checked", "id", "shipDate", "sku", "updatedAt" FROM "ShippingChecklistItem";
DROP TABLE "ShippingChecklistItem";
ALTER TABLE "new_ShippingChecklistItem" RENAME TO "ShippingChecklistItem";
CREATE UNIQUE INDEX "ShippingChecklistItem_shipDate_orderId_sku_key" ON "ShippingChecklistItem"("shipDate", "orderId", "sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
