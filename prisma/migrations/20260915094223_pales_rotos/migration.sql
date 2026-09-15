-- CreateTable
CREATE TABLE "broken_pallet_movements" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "buyerId" TEXT,
    "reference" TEXT,
    "holdedAlbaranId" TEXT,
    "vehiclePlate" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broken_pallet_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broken_pallet_movements_reference_key" ON "broken_pallet_movements"("reference");

-- CreateIndex
CREATE INDEX "broken_pallet_movements_buyerId_idx" ON "broken_pallet_movements"("buyerId");

-- CreateIndex
CREATE INDEX "broken_pallet_movements_createdAt_idx" ON "broken_pallet_movements"("createdAt");

-- AddForeignKey
ALTER TABLE "broken_pallet_movements" ADD CONSTRAINT "broken_pallet_movements_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
