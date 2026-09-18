-- CreateTable
CREATE TABLE "TikTokAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "accessTokenExpireAt" DATETIME NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "refreshTokenExpireAt" DATETIME NOT NULL,
    "sellerName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TikTokShop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopCipher" TEXT NOT NULL,
    "shopName" TEXT,
    "region" TEXT,
    "authorizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TikTokShop_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "TikTokAuthorization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TikTokShop_shopId_key" ON "TikTokShop"("shopId");
