-- AlterTable
ALTER TABLE "Restaurant"
  ADD COLUMN "adminDisabledAt" TIMESTAMP(3),
  ADD COLUMN "adminDisabledByUserId" TEXT,
  ADD COLUMN "favoritesCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RestaurantFavorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantReview" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantFavorite_userId_restaurantId_key" ON "RestaurantFavorite"("userId", "restaurantId");
CREATE INDEX "RestaurantFavorite_userId_idx" ON "RestaurantFavorite"("userId");
CREATE INDEX "RestaurantFavorite_restaurantId_idx" ON "RestaurantFavorite"("restaurantId");
CREATE INDEX "RestaurantFavorite_createdAt_idx" ON "RestaurantFavorite"("createdAt");

CREATE UNIQUE INDEX "RestaurantReview_userId_restaurantId_key" ON "RestaurantReview"("userId", "restaurantId");
CREATE INDEX "RestaurantReview_userId_idx" ON "RestaurantReview"("userId");
CREATE INDEX "RestaurantReview_restaurantId_idx" ON "RestaurantReview"("restaurantId");
CREATE INDEX "RestaurantReview_rating_idx" ON "RestaurantReview"("rating");
CREATE INDEX "RestaurantReview_createdAt_idx" ON "RestaurantReview"("createdAt");

CREATE INDEX "Restaurant_adminDisabledAt_idx" ON "Restaurant"("adminDisabledAt");
CREATE INDEX "Restaurant_adminDisabledByUserId_idx" ON "Restaurant"("adminDisabledByUserId");

-- AddForeignKey
ALTER TABLE "Restaurant"
  ADD CONSTRAINT "Restaurant_adminDisabledByUserId_fkey"
  FOREIGN KEY ("adminDisabledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RestaurantFavorite"
  ADD CONSTRAINT "RestaurantFavorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantFavorite"
  ADD CONSTRAINT "RestaurantFavorite_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantReview"
  ADD CONSTRAINT "RestaurantReview_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantReview"
  ADD CONSTRAINT "RestaurantReview_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantReview"
  ADD CONSTRAINT "RestaurantReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);

-- Backfill counters
UPDATE "Restaurant" r
SET "favoritesCount" = COALESCE(stats.cnt, 0)
FROM (
  SELECT "restaurantId", COUNT(*)::INTEGER AS cnt
  FROM "RestaurantFavorite"
  GROUP BY "restaurantId"
) stats
WHERE r."id" = stats."restaurantId";

UPDATE "Restaurant" r
SET
  "ratingCount" = COALESCE(stats.cnt, 0),
  "averageRating" = COALESCE(stats.avg_rating, 0)
FROM (
  SELECT "restaurantId",
         COUNT(*)::INTEGER AS cnt,
         ROUND(AVG("rating")::numeric, 2) AS avg_rating
  FROM "RestaurantReview"
  GROUP BY "restaurantId"
) stats
WHERE r."id" = stats."restaurantId";
