-- CreateEnum
CREATE TYPE "StockAdjustmentType" AS ENUM ('ALTA', 'BAJA');

-- AlterTable
ALTER TABLE "sacks" ADD COLUMN     "stockEntryId" TEXT,
ADD COLUMN     "stockExitId" TEXT;

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "type" "StockAdjustmentType" NOT NULL,
    "materialId" TEXT NOT NULL,
    "zoneId" TEXT,
    "numSacks" INTEGER NOT NULL,
    "weightPerSack" DOUBLE PRECISION,
    "totalWeight" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_adjustments_materialId_idx" ON "stock_adjustments"("materialId");

-- CreateIndex
CREATE INDEX "stock_adjustments_date_idx" ON "stock_adjustments"("date");

-- CreateIndex
CREATE INDEX "sacks_stockEntryId_idx" ON "sacks"("stockEntryId");

-- CreateIndex
CREATE INDEX "sacks_stockExitId_idx" ON "sacks"("stockExitId");

-- AddForeignKey
ALTER TABLE "sacks" ADD CONSTRAINT "sacks_stockEntryId_fkey" FOREIGN KEY ("stockEntryId") REFERENCES "stock_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sacks" ADD CONSTRAINT "sacks_stockExitId_fkey" FOREIGN KEY ("stockExitId") REFERENCES "stock_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

