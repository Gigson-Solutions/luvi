-- AlterTable
ALTER TABLE "consumables" ADD COLUMN     "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "material_categories" ADD COLUMN     "qualityRangeSetId" TEXT;

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "qualityRangeSetId" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "additionalCostsPerShipment" DOUBLE PRECISION,
ADD COLUMN     "arrivalCostsPerContainer" DOUBLE PRECISION,
ADD COLUMN     "arrivalCostsPerShipment" DOUBLE PRECISION,
ADD COLUMN     "customsDuties" DOUBLE PRECISION,
ADD COLUMN     "deliveryTransportPerContainer" DOUBLE PRECISION,
ADD COLUMN     "oceanFreightPerContainer" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "quality_range_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ranges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_range_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_consumables" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "consumableId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_consumables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sack_consumables" (
    "id" TEXT NOT NULL,
    "sackId" TEXT NOT NULL,
    "consumableId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sack_consumables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT,
    "userId" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "expectedCount" INTEGER,
    "scannedCount" INTEGER,
    "missingCount" INTEGER,
    "unknownCount" INTEGER,
    "missingSackIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_scans" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "sackId" TEXT,
    "qrCode" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quality_range_sets_name_key" ON "quality_range_sets"("name");

-- CreateIndex
CREATE INDEX "material_consumables_consumableId_idx" ON "material_consumables"("consumableId");

-- CreateIndex
CREATE UNIQUE INDEX "material_consumables_materialId_consumableId_key" ON "material_consumables"("materialId", "consumableId");

-- CreateIndex
CREATE INDEX "sack_consumables_sackId_idx" ON "sack_consumables"("sackId");

-- CreateIndex
CREATE INDEX "sack_consumables_consumableId_idx" ON "sack_consumables"("consumableId");

-- CreateIndex
CREATE INDEX "inventory_counts_warehouseId_idx" ON "inventory_counts"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_counts_startedAt_idx" ON "inventory_counts"("startedAt");

-- CreateIndex
CREATE INDEX "inventory_scans_countId_idx" ON "inventory_scans"("countId");

-- CreateIndex
CREATE INDEX "inventory_scans_sackId_idx" ON "inventory_scans"("sackId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_scans_countId_qrCode_key" ON "inventory_scans"("countId", "qrCode");

-- CreateIndex
CREATE INDEX "material_categories_qualityRangeSetId_idx" ON "material_categories"("qualityRangeSetId");

-- CreateIndex
CREATE INDEX "materials_qualityRangeSetId_idx" ON "materials"("qualityRangeSetId");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_qualityRangeSetId_fkey" FOREIGN KEY ("qualityRangeSetId") REFERENCES "quality_range_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_qualityRangeSetId_fkey" FOREIGN KEY ("qualityRangeSetId") REFERENCES "quality_range_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_consumables" ADD CONSTRAINT "material_consumables_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_consumables" ADD CONSTRAINT "material_consumables_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "consumables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sack_consumables" ADD CONSTRAINT "sack_consumables_sackId_fkey" FOREIGN KEY ("sackId") REFERENCES "sacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sack_consumables" ADD CONSTRAINT "sack_consumables_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "consumables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_scans" ADD CONSTRAINT "inventory_scans_countId_fkey" FOREIGN KEY ("countId") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_scans" ADD CONSTRAINT "inventory_scans_sackId_fkey" FOREIGN KEY ("sackId") REFERENCES "sacks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
