-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED');

-- AlterEnum
ALTER TYPE "VerificationChannel" ADD VALUE 'WHATSAPP';

-- AlterEnum
ALTER TYPE "VerificationProvider" ADD VALUE 'APIBRASIL';
