-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "consumable_movements_consumableId_idx" ON "consumable_movements"("consumableId");

-- CreateIndex
CREATE INDEX "containers_supplierId_idx" ON "containers"("supplierId");

-- CreateIndex
CREATE INDEX "containers_warehouseId_idx" ON "containers"("warehouseId");

-- CreateIndex
CREATE INDEX "containers_providerShipmentId_idx" ON "containers"("providerShipmentId");

-- CreateIndex
CREATE INDEX "pallet_movements_buyerId_idx" ON "pallet_movements"("buyerId");

-- CreateIndex
CREATE INDEX "pallet_movements_shipmentId_idx" ON "pallet_movements"("shipmentId");

-- CreateIndex
CREATE INDEX "production_lots_materialId_idx" ON "production_lots"("materialId");

-- CreateIndex
CREATE INDEX "provider_shipments_purchaseOrderId_idx" ON "provider_shipments"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "quality_records_lotId_idx" ON "quality_records"("lotId");

-- CreateIndex
CREATE INDEX "quality_records_materialId_idx" ON "quality_records"("materialId");

-- CreateIndex
CREATE INDEX "quality_records_supplierId_idx" ON "quality_records"("supplierId");

-- CreateIndex
CREATE INDEX "quality_records_recordedAt_idx" ON "quality_records"("recordedAt");

-- CreateIndex
CREATE INDEX "sacks_materialId_idx" ON "sacks"("materialId");

-- CreateIndex
CREATE INDEX "sacks_lotId_idx" ON "sacks"("lotId");

-- CreateIndex
CREATE INDEX "shipment_lots_shipmentId_idx" ON "shipment_lots"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_lots_lotId_idx" ON "shipment_lots"("lotId");

-- CreateIndex
CREATE INDEX "shipment_sacks_shipmentId_idx" ON "shipment_sacks"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_sacks_sackId_idx" ON "shipment_sacks"("sackId");

-- CreateIndex
CREATE INDEX "shipments_buyerId_idx" ON "shipments"("buyerId");

-- CreateIndex
CREATE INDEX "shipments_carrierId_idx" ON "shipments"("carrierId");

-- CreateIndex
CREATE INDEX "transformation_inputs_transformationId_idx" ON "transformation_inputs"("transformationId");

-- CreateIndex
CREATE INDEX "transformation_inputs_sackId_idx" ON "transformation_inputs"("sackId");

-- CreateIndex
CREATE INDEX "transformations_lotId_idx" ON "transformations"("lotId");

-- CreateIndex
CREATE INDEX "zones_warehouseId_idx" ON "zones"("warehouseId");
