-- Precio (€/t) por proveedor y producto para valorar el stock que no viene de un
-- pedido (altas manuales, stock inicial). Tabla nueva: no toca datos existentes.
-- CreateTable
CREATE TABLE "supplier_material_prices" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "pricePerTon" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_material_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_material_prices_materialId_idx" ON "supplier_material_prices"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_material_prices_supplierId_materialId_key" ON "supplier_material_prices"("supplierId", "materialId");

-- AddForeignKey
ALTER TABLE "supplier_material_prices" ADD CONSTRAINT "supplier_material_prices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_material_prices" ADD CONSTRAINT "supplier_material_prices_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
