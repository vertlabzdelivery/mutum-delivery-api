ALTER TABLE "User"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_isActive_idx" ON "User"("isActive");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
