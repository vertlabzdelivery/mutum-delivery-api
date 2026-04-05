-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expoPushToken" TEXT,
ADD COLUMN     "expoPushTokenUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserAddress" ALTER COLUMN "zipCode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StoreCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantStoreCategory" (
    "restaurantId" TEXT NOT NULL,
    "storeCategoryId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantStoreCategory_pkey" PRIMARY KEY ("restaurantId","storeCategoryId")
);

-- CreateTable
CREATE TABLE "PhoneVerificationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" "VerificationChannel" NOT NULL DEFAULT 'SMS',
    "provider" "VerificationProvider" NOT NULL DEFAULT 'APIBRASIL',
    "providerKey" TEXT,
    "localCodeHash" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 1,
    "nextAllowedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneVerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreCategory_name_key" ON "StoreCategory"("name");

-- CreateIndex
CREATE INDEX "StoreCategory_isActive_idx" ON "StoreCategory"("isActive");

-- CreateIndex
CREATE INDEX "StoreCategory_sortOrder_idx" ON "StoreCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "RestaurantStoreCategory_restaurantId_idx" ON "RestaurantStoreCategory"("restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantStoreCategory_storeCategoryId_idx" ON "RestaurantStoreCategory"("storeCategoryId");

-- CreateIndex
CREATE INDEX "PhoneVerificationSession_userId_idx" ON "PhoneVerificationSession"("userId");

-- CreateIndex
CREATE INDEX "PhoneVerificationSession_phone_idx" ON "PhoneVerificationSession"("phone");

-- CreateIndex
CREATE INDEX "PhoneVerificationSession_status_idx" ON "PhoneVerificationSession"("status");

-- AddForeignKey
ALTER TABLE "RestaurantStoreCategory" ADD CONSTRAINT "RestaurantStoreCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantStoreCategory" ADD CONSTRAINT "RestaurantStoreCategory_storeCategoryId_fkey" FOREIGN KEY ("storeCategoryId") REFERENCES "StoreCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneVerificationSession" ADD CONSTRAINT "PhoneVerificationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
