-- Impresoras de etiquetas dadas de alta desde Configuración y la última que
-- eligió cada usuario. Sin filas se sigue imprimiendo con la Zebra del .env.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastPrinterId" TEXT;

-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bridgePort" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_lastPrinterId_fkey" FOREIGN KEY ("lastPrinterId") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
