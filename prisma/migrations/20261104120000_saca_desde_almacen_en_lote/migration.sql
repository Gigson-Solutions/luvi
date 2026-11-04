-- Sacas que estaban en almacén y se meten a mano en un lote de salida de
-- Expediciones. false por defecto: las sacas existentes no cambian.
-- AlterTable
ALTER TABLE "sacks" ADD COLUMN     "fromStock" BOOLEAN NOT NULL DEFAULT false;
