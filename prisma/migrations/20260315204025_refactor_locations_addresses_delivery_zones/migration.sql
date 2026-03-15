/*
  Warnings:

  - You are about to drop the `Address` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Address" DROP CONSTRAINT "Address_userId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryAt" TIMESTAMP(3),
ADD COLUMN     "deliveryReference" TEXT,
ADD COLUMN     "neighborhoodName" TEXT,
ADD COLUMN     "preparingAt" TIMESTAMP(3),
ADD COLUMN     "userAddressId" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "cityId" TEXT;

-- DropTable
DROP TABLE "Address";

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Neighborhood" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Neighborhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "reference" TEXT,
    "zipCode" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantDeliveryZone" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "neighborhoodId" TEXT NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "minTime" INTEGER NOT NULL,
    "maxTime" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantDeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");

-- CreateIndex
CREATE INDEX "City_stateId_idx" ON "City"("stateId");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_stateId_key" ON "City"("name", "stateId");

-- CreateIndex
CREATE INDEX "Neighborhood_cityId_idx" ON "Neighborhood"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "Neighborhood_name_cityId_key" ON "Neighborhood"("name", "cityId");

-- CreateIndex
CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");

-- CreateIndex
CREATE INDEX "UserAddress_cityId_idx" ON "UserAddress"("cityId");

-- CreateIndex
CREATE INDEX "UserAddress_neighborhoodId_idx" ON "UserAddress"("neighborhoodId");

-- CreateIndex
CREATE INDEX "RestaurantDeliveryZone_restaurantId_idx" ON "RestaurantDeliveryZone"("restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantDeliveryZone_neighborhoodId_idx" ON "RestaurantDeliveryZone"("neighborhoodId");

-- CreateIndex
CREATE INDEX "RestaurantDeliveryZone_isActive_idx" ON "RestaurantDeliveryZone"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDeliveryZone_restaurantId_neighborhoodId_key" ON "RestaurantDeliveryZone"("restaurantId", "neighborhoodId");

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_idx" ON "MenuItem"("restaurantId");

-- CreateIndex
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");

-- CreateIndex
CREATE INDEX "MenuItemChoice_optionId_idx" ON "MenuItemChoice"("optionId");

-- CreateIndex
CREATE INDEX "MenuItemOption_menuItemId_idx" ON "MenuItemOption"("menuItemId");

-- CreateIndex
CREATE INDEX "OpeningHour_restaurantId_idx" ON "OpeningHour"("restaurantId");

-- CreateIndex
CREATE INDEX "Order_userAddressId_idx" ON "Order"("userAddressId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_menuItemId_idx" ON "OrderItem"("menuItemId");

-- CreateIndex
CREATE INDEX "OrderItemSelection_orderItemId_idx" ON "OrderItemSelection"("orderItemId");

-- CreateIndex
CREATE INDEX "Restaurant_ownerId_idx" ON "Restaurant"("ownerId");

-- CreateIndex
CREATE INDEX "Restaurant_cityId_idx" ON "Restaurant"("cityId");

-- CreateIndex
CREATE INDEX "Restaurant_isActive_idx" ON "Restaurant"("isActive");

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Neighborhood" ADD CONSTRAINT "Neighborhood_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDeliveryZone" ADD CONSTRAINT "RestaurantDeliveryZone_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDeliveryZone" ADD CONSTRAINT "RestaurantDeliveryZone_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
