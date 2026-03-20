-- CreateEnum
CREATE TYPE "BillingCycleStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateTable
CREATE TABLE "RestaurantBillingCycle" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "referenceYear" INTEGER,
    "referenceMonth" INTEGER,
    "grossSales" DECIMAL(10,2) NOT NULL,
    "canceledSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commissionRate" DECIMAL(5,4) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "netSales" DECIMAL(10,2) NOT NULL,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "billedOrders" INTEGER NOT NULL DEFAULT 0,
    "canceledOrders" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(10,2) NOT NULL,
    "status" "BillingCycleStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "generatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantBillingCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantBillingItem" (
    "id" TEXT NOT NULL,
    "billingCycleId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderTotal" DECIMAL(10,2) NOT NULL,
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "commissionBase" DECIMAL(10,2) NOT NULL,
    "commissionRate" DECIMAL(5,4) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantBillingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPayment" (
    "id" TEXT NOT NULL,
    "billingCycleId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantBillingCycle_restaurantId_periodStart_periodEnd_key" ON "RestaurantBillingCycle"("restaurantId", "periodStart", "periodEnd");
CREATE INDEX "RestaurantBillingCycle_restaurantId_idx" ON "RestaurantBillingCycle"("restaurantId");
CREATE INDEX "RestaurantBillingCycle_periodStart_periodEnd_idx" ON "RestaurantBillingCycle"("periodStart", "periodEnd");
CREATE INDEX "RestaurantBillingCycle_status_idx" ON "RestaurantBillingCycle"("status");
CREATE INDEX "RestaurantBillingCycle_generatedByUserId_idx" ON "RestaurantBillingCycle"("generatedByUserId");

CREATE UNIQUE INDEX "RestaurantBillingItem_billingCycleId_orderId_key" ON "RestaurantBillingItem"("billingCycleId", "orderId");
CREATE INDEX "RestaurantBillingItem_billingCycleId_idx" ON "RestaurantBillingItem"("billingCycleId");
CREATE INDEX "RestaurantBillingItem_orderId_idx" ON "RestaurantBillingItem"("orderId");
CREATE INDEX "RestaurantBillingItem_isCanceled_idx" ON "RestaurantBillingItem"("isCanceled");

CREATE INDEX "RestaurantPayment_billingCycleId_idx" ON "RestaurantPayment"("billingCycleId");
CREATE INDEX "RestaurantPayment_paidAt_idx" ON "RestaurantPayment"("paidAt");
CREATE INDEX "RestaurantPayment_createdByUserId_idx" ON "RestaurantPayment"("createdByUserId");

-- AddForeignKey
ALTER TABLE "RestaurantBillingCycle" ADD CONSTRAINT "RestaurantBillingCycle_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantBillingCycle" ADD CONSTRAINT "RestaurantBillingCycle_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RestaurantBillingItem" ADD CONSTRAINT "RestaurantBillingItem_billingCycleId_fkey" FOREIGN KEY ("billingCycleId") REFERENCES "RestaurantBillingCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantBillingItem" ADD CONSTRAINT "RestaurantBillingItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestaurantPayment" ADD CONSTRAINT "RestaurantPayment_billingCycleId_fkey" FOREIGN KEY ("billingCycleId") REFERENCES "RestaurantBillingCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantPayment" ADD CONSTRAINT "RestaurantPayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
