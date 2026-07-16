-- AlterTable
ALTER TABLE "containers" ADD COLUMN     "warehouseId" TEXT;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
