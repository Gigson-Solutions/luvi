-- Proveedor propio de la saca, para las que no vienen de un contenedor (altas
-- manuales de inventario, stock inicial). Opcional y sin valor por defecto: las
-- sacas existentes quedan como estaban (sin proveedor) y se pueden asignar
-- después desde su ficha. Si la saca tiene contenedor, manda el de éste.
-- AlterTable
ALTER TABLE "sacks" ADD COLUMN     "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "sacks_supplierId_idx" ON "sacks"("supplierId");

-- AddForeignKey
ALTER TABLE "sacks" ADD CONSTRAINT "sacks_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
