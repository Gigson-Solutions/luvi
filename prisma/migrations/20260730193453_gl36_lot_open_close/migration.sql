-- AlterTable
ALTER TABLE "production_lots" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "isOpen" BOOLEAN NOT NULL DEFAULT true;

