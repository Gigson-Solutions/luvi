-- AlterTable
ALTER TABLE "materials" ADD COLUMN "processingCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- El coste de procesado deja de ser uno fijo en Configuración → Costes y pasa
-- a ser de cada material. Para que los lotes existentes no cambien de coste,
-- los materiales de salida heredan el valor que había configurado (31 € si no
-- se tocó nunca).
UPDATE "materials" m
SET "processingCost" = COALESCE(
  (SELECT (c."value"->>'processingPerSack')::DOUBLE PRECISION
     FROM "config" c WHERE c."key" = 'costs'),
  31
)
WHERE m."categoryId" IS NULL
   OR m."categoryId" NOT IN (
     SELECT mc."id" FROM "material_categories" mc WHERE mc."kind" = 'MATERIA_PRIMA'
   );
