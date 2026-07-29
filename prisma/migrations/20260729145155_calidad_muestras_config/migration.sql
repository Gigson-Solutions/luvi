-- DropForeignKey
ALTER TABLE "quality_records" DROP CONSTRAINT "quality_records_lotId_fkey";

-- DropForeignKey
ALTER TABLE "quality_records" DROP CONSTRAINT "quality_records_materialId_fkey";

-- AlterTable
ALTER TABLE "quality_records" ADD COLUMN     "client" TEXT,
ADD COLUMN     "date" TIMESTAMP(3),
ALTER COLUMN "lotId" DROP NOT NULL,
ALTER COLUMN "materialId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "quality_samples" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "density" DOUBLE PRECISION,
    "pvc" DOUBLE PRECISION,
    "cola" DOUBLE PRECISION,
    "multicapas" DOUBLE PRECISION,
    "metal" DOUBLE PRECISION,
    "otros" DOUBLE PRECISION,
    "status" TEXT,
    "comment" TEXT,

    CONSTRAINT "quality_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "quality_samples_recordId_idx" ON "quality_samples"("recordId");

-- CreateIndex
CREATE INDEX "quality_records_date_idx" ON "quality_records"("date");

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "production_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_samples" ADD CONSTRAINT "quality_samples_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "quality_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

