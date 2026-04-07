-- Índices críticos para escalabilidade
-- User: busca por telefone (usado em login, verificação, registro)
CREATE INDEX IF NOT EXISTS "User_phone_idx" ON "User"("phone");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_phone_isActive_deletedAt_idx" ON "User"("phone", "isActive", "deletedAt");

-- Order: queries compostas mais frequentes
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Order_restaurantId_createdAt_idx" ON "Order"("restaurantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Order_userId_restaurantId_status_idx" ON "Order"("userId", "restaurantId", "status");
