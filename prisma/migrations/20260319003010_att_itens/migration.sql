-- AlterTable
ALTER TABLE "MenuItemChoice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MenuItemOption" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "baseUnitPrice" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderItemSelection" ALTER COLUMN "optionName" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
