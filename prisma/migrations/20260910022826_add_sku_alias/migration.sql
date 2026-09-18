-- CreateTable
CREATE TABLE "SkuAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawSku" TEXT NOT NULL,
    "displaySku" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SkuAlias_rawSku_key" ON "SkuAlias"("rawSku");
