-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('REFERRAL', 'PROMOTIONAL', 'REFERRAL_REWARD');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "ReferralUsageStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'AVAILABLE', 'USED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;

-- AlterTable
ALTER TABLE "Restaurant"
ADD COLUMN "acceptsReferralCoupons" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "acceptsPromotionalCoupons" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "couponCode" TEXT,
ADD COLUMN "couponType" "CouponType",
ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "promotionalCouponId" TEXT,
ADD COLUMN "referralOwnerUserId" TEXT,
ADD COLUMN "referralRewardId" TEXT;

-- Backfill referralCode for existing users
UPDATE "User"
SET "referralCode" = CONCAT('USR', UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 7)))
WHERE "referralCode" IS NULL;

-- Make referralCode required
ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "PromotionalCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscountAmount" DECIMAL(10,2),
    "minOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionalCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionalCouponUsage" (
    "id" TEXT NOT NULL,
    "promotionalCouponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponCode" TEXT NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionalCouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralUsage" (
    "id" TEXT NOT NULL,
    "referralOwnerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" "ReferralUsageStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscountAmount" DECIMAL(10,2),
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "rewardGrantedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referralOwnerUserId" TEXT NOT NULL,
    "referralUsageId" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscountAmount" DECIMAL(10,2),
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
    "grantedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedOrderId" TEXT,
    "appliedDiscountAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "Order_promotionalCouponId_idx" ON "Order"("promotionalCouponId");
CREATE INDEX "Order_referralOwnerUserId_idx" ON "Order"("referralOwnerUserId");
CREATE UNIQUE INDEX "Order_referralRewardId_key" ON "Order"("referralRewardId");
CREATE INDEX "Order_couponCode_idx" ON "Order"("couponCode");
CREATE UNIQUE INDEX "PromotionalCoupon_code_key" ON "PromotionalCoupon"("code");
CREATE INDEX "PromotionalCoupon_isActive_idx" ON "PromotionalCoupon"("isActive");
CREATE INDEX "PromotionalCoupon_code_idx" ON "PromotionalCoupon"("code");
CREATE INDEX "PromotionalCoupon_startsAt_endsAt_idx" ON "PromotionalCoupon"("startsAt", "endsAt");
CREATE INDEX "PromotionalCoupon_createdByAdminId_idx" ON "PromotionalCoupon"("createdByAdminId");
CREATE UNIQUE INDEX "PromotionalCouponUsage_orderId_key" ON "PromotionalCouponUsage"("orderId");
CREATE INDEX "PromotionalCouponUsage_promotionalCouponId_idx" ON "PromotionalCouponUsage"("promotionalCouponId");
CREATE INDEX "PromotionalCouponUsage_userId_idx" ON "PromotionalCouponUsage"("userId");
CREATE INDEX "PromotionalCouponUsage_usedAt_idx" ON "PromotionalCouponUsage"("usedAt");
CREATE UNIQUE INDEX "ReferralUsage_orderId_key" ON "ReferralUsage"("orderId");
CREATE UNIQUE INDEX "ReferralUsage_referredUserId_key" ON "ReferralUsage"("referredUserId");
CREATE INDEX "ReferralUsage_referralOwnerUserId_idx" ON "ReferralUsage"("referralOwnerUserId");
CREATE INDEX "ReferralUsage_referredUserId_idx" ON "ReferralUsage"("referredUserId");
CREATE INDEX "ReferralUsage_status_idx" ON "ReferralUsage"("status");
CREATE INDEX "ReferralUsage_referralCode_idx" ON "ReferralUsage"("referralCode");
CREATE UNIQUE INDEX "ReferralReward_code_key" ON "ReferralReward"("code");
CREATE UNIQUE INDEX "ReferralReward_referralUsageId_key" ON "ReferralReward"("referralUsageId");
CREATE UNIQUE INDEX "ReferralReward_usedOrderId_key" ON "ReferralReward"("usedOrderId");
CREATE INDEX "ReferralReward_referralOwnerUserId_idx" ON "ReferralReward"("referralOwnerUserId");
CREATE INDEX "ReferralReward_status_idx" ON "ReferralReward"("status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promotionalCouponId_fkey" FOREIGN KEY ("promotionalCouponId") REFERENCES "PromotionalCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_referralOwnerUserId_fkey" FOREIGN KEY ("referralOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_referralRewardId_fkey" FOREIGN KEY ("referralRewardId") REFERENCES "ReferralReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionalCoupon" ADD CONSTRAINT "PromotionalCoupon_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionalCouponUsage" ADD CONSTRAINT "PromotionalCouponUsage_promotionalCouponId_fkey" FOREIGN KEY ("promotionalCouponId") REFERENCES "PromotionalCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionalCouponUsage" ADD CONSTRAINT "PromotionalCouponUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionalCouponUsage" ADD CONSTRAINT "PromotionalCouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralUsage" ADD CONSTRAINT "ReferralUsage_referralOwnerUserId_fkey" FOREIGN KEY ("referralOwnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralUsage" ADD CONSTRAINT "ReferralUsage_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralUsage" ADD CONSTRAINT "ReferralUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referralOwnerUserId_fkey" FOREIGN KEY ("referralOwnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referralUsageId_fkey" FOREIGN KEY ("referralUsageId") REFERENCES "ReferralUsage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_usedOrderId_fkey" FOREIGN KEY ("usedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
