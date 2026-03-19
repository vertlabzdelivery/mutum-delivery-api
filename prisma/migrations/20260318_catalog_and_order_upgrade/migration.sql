-- Evolução de catálogo e pedidos
-- Execute com: npx prisma migrate dev --name catalog_and_order_upgrade

CREATE TYPE "OptionGroupType" AS ENUM (
  'SIZE',
  'FRUIT',
  'TOPPING',
  'COMPLEMENT',
  'SYRUP',
  'ADDITION',
  'CUSTOMIZATION'
);

ALTER TABLE "Restaurant"
  ADD COLUMN "bannerUrl" TEXT,
  ADD COLUMN "minOrder" DECIMAL(10,2);

CREATE TABLE "MenuCategory" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MenuCategory_restaurantId_name_key" ON "MenuCategory"("restaurantId", "name");
CREATE INDEX "MenuCategory_restaurantId_idx" ON "MenuCategory"("restaurantId");
CREATE INDEX "MenuCategory_sortOrder_idx" ON "MenuCategory"("sortOrder");
CREATE INDEX "MenuCategory_isActive_idx" ON "MenuCategory"("isActive");

ALTER TABLE "MenuCategory"
  ADD CONSTRAINT "MenuCategory_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MenuItem"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "promotionalText" TEXT,
  ADD COLUMN "allowsItemNotes" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "maxPerOrder" INTEGER;

CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");
CREATE INDEX "MenuItem_sortOrder_idx" ON "MenuItem"("sortOrder");
CREATE INDEX "MenuItem_isFeatured_idx" ON "MenuItem"("isFeatured");

ALTER TABLE "MenuItem"
  ADD CONSTRAINT "MenuItem_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MenuItemOption"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "optionType" "OptionGroupType" NOT NULL DEFAULT 'ADDITION',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "MenuItemOption_sortOrder_idx" ON "MenuItemOption"("sortOrder");
CREATE INDEX "MenuItemOption_isActive_idx" ON "MenuItemOption"("isActive");

ALTER TABLE "MenuItemChoice"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "MenuItemChoice_sortOrder_idx" ON "MenuItemChoice"("sortOrder");
CREATE INDEX "MenuItemChoice_isActive_idx" ON "MenuItemChoice"("isActive");

ALTER TABLE "Order"
  ADD COLUMN "cashChangeFor" DECIMAL(10,2);

ALTER TABLE "OrderItem"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "baseUnitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "OrderItem" SET "baseUnitPrice" = "unitPrice";

ALTER TABLE "OrderItemSelection"
  ADD COLUMN "optionId" TEXT,
  ADD COLUMN "optionName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "choiceId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "OrderItemSelection" SET "optionName" = 'Seleção';

CREATE TABLE "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" "OrderStatus",
  "toStatus" "OrderStatus" NOT NULL,
  "changedByUserId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");
CREATE INDEX "OrderStatusHistory_changedByUserId_idx" ON "OrderStatusHistory"("changedByUserId");
CREATE INDEX "OrderStatusHistory_createdAt_idx" ON "OrderStatusHistory"("createdAt");

ALTER TABLE "OrderStatusHistory"
  ADD CONSTRAINT "OrderStatusHistory_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderStatusHistory"
  ADD CONSTRAINT "OrderStatusHistory_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
