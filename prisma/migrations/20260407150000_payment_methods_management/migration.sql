CREATE TABLE "PaymentMethodOption" (
  "id" TEXT NOT NULL,
  "code" "PaymentMethod" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethodOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantAcceptedPaymentMethod" (
  "restaurantId" TEXT NOT NULL,
  "paymentMethodOptionId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantAcceptedPaymentMethod_pkey" PRIMARY KEY ("restaurantId","paymentMethodOptionId")
);

CREATE UNIQUE INDEX "PaymentMethodOption_code_key" ON "PaymentMethodOption"("code");
CREATE INDEX "PaymentMethodOption_isActive_idx" ON "PaymentMethodOption"("isActive");
CREATE INDEX "PaymentMethodOption_sortOrder_idx" ON "PaymentMethodOption"("sortOrder");
CREATE INDEX "RestaurantAcceptedPaymentMethod_restaurantId_idx" ON "RestaurantAcceptedPaymentMethod"("restaurantId");
CREATE INDEX "RestaurantAcceptedPaymentMethod_paymentMethodOptionId_idx" ON "RestaurantAcceptedPaymentMethod"("paymentMethodOptionId");

ALTER TABLE "RestaurantAcceptedPaymentMethod"
  ADD CONSTRAINT "RestaurantAcceptedPaymentMethod_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantAcceptedPaymentMethod"
  ADD CONSTRAINT "RestaurantAcceptedPaymentMethod_paymentMethodOptionId_fkey"
  FOREIGN KEY ("paymentMethodOptionId") REFERENCES "PaymentMethodOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
