-- Un mismo Bill of Lading puede cubrir más contenedores de los que viajan en un
-- solo envío (o editarse un envío con el BL de otro): la unicidad del BL en
-- provider_shipments hacía fallar el alta y la edición con "Unique constraint
-- failed on billOfLading". El BL deja de ser único; se conserva un índice normal.
DROP INDEX "provider_shipments_billOfLading_key";
CREATE INDEX "provider_shipments_billOfLading_idx" ON "provider_shipments"("billOfLading");
