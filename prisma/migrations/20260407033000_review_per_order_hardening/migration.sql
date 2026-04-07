-- Restaurant reviews become per-order instead of per-user+restaurant
ALTER TABLE "RestaurantReview"
  ADD COLUMN IF NOT EXISTS "orderId" TEXT;

WITH matched_orders AS (
  SELECT rr."id" AS review_id,
         o."id" AS order_id,
         ROW_NUMBER() OVER (
           PARTITION BY rr."id"
           ORDER BY o."deliveredAt" DESC NULLS LAST, o."createdAt" DESC, o."id" DESC
         ) AS rn
  FROM "RestaurantReview" rr
  JOIN "Order" o
    ON o."userId" = rr."userId"
   AND o."restaurantId" = rr."restaurantId"
   AND o."status" = 'DELIVERED'
)
UPDATE "RestaurantReview" rr
SET "orderId" = matched_orders.order_id
FROM matched_orders
WHERE rr."id" = matched_orders.review_id
  AND matched_orders.rn = 1
  AND rr."orderId" IS NULL;

DELETE FROM "RestaurantReview"
WHERE "orderId" IS NULL;

ALTER TABLE "RestaurantReview"
  ALTER COLUMN "orderId" SET NOT NULL;

DROP INDEX IF EXISTS "RestaurantReview_userId_restaurantId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantReview_orderId_key" ON "RestaurantReview"("orderId");
CREATE INDEX IF NOT EXISTS "RestaurantReview_restaurantId_createdAt_idx" ON "RestaurantReview"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "RestaurantReview_userId_restaurantId_createdAt_idx" ON "RestaurantReview"("userId", "restaurantId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RestaurantReview_orderId_fkey'
      AND table_name = 'RestaurantReview'
  ) THEN
    ALTER TABLE "RestaurantReview"
      ADD CONSTRAINT "RestaurantReview_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
