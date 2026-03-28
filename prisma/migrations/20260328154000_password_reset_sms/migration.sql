-- CreateEnum
CREATE TYPE "PasswordResetStatus" AS ENUM ('PENDING', 'VERIFIED', 'USED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "PasswordResetSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "channel" "VerificationChannel" NOT NULL DEFAULT 'SMS',
    "provider" "VerificationProvider" NOT NULL DEFAULT 'INTERNAL',
    "providerKey" TEXT,
    "localCodeHash" TEXT,
    "resetTokenHash" TEXT,
    "status" "PasswordResetStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 1,
    "nextAllowedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "resetTokenExpiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetSession_resetTokenHash_key" ON "PasswordResetSession"("resetTokenHash");
CREATE INDEX "PasswordResetSession_userId_idx" ON "PasswordResetSession"("userId");
CREATE INDEX "PasswordResetSession_phone_idx" ON "PasswordResetSession"("phone");
CREATE INDEX "PasswordResetSession_status_idx" ON "PasswordResetSession"("status");

-- AddForeignKey
ALTER TABLE "PasswordResetSession" ADD CONSTRAINT "PasswordResetSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
