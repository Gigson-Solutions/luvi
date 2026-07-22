-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OPERARIO', 'ADMINISTRACION', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SackStatus" AS ENUM ('PENDIENTE_RECIBIR', 'EN_ALMACEN', 'EN_PRODUCCION', 'PROCESADA', 'PRODUCTO_TERMINADO', 'SUBPRODUCTO', 'RECHAZO', 'EN_TRANSITO', 'ENTREGADA', 'BAJA');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PELLET_PE', 'PELLET_PP', 'PELLET_PET', 'FILM_PE', 'FILM_PP', 'RIGIDO_MIXTO', 'OTRO');

-- CreateEnum
CREATE TYPE "LotType" AS ENUM ('PRODUCTO_TERMINADO', 'SUBPRODUCTO', 'RECHAZO');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('BORRADOR', 'CONFIRMADO', 'EXPEDIDO', 'ENTREGADO');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('ABIERTA', 'EN_REVISION', 'EN_PROCESO', 'RESUELTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ABIERTA', 'EN_TRANSITO', 'RECIBIDA_PARCIAL', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ConsumableType" AS ENUM ('PALLET', 'SACA_VACIA', 'CAPUCHON', 'OTRO');

-- CreateEnum
CREATE TYPE "QualityResult" AS ENUM ('OK', 'NOK', 'PENDIENTE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERARIO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ES',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ES',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "holdedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxCapacity" INTEGER NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containers" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "billOfLading" TEXT,
    "supplierId" TEXT NOT NULL,
    "materialId" TEXT,
    "expectedWeight" DOUBLE PRECISION,
    "actualWeight" DOUBLE PRECISION,
    "numSacks" INTEGER,
    "numPallets" INTEGER DEFAULT 0,
    "notes" TEXT,
    "estimatedArrival" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "weighedAt" TIMESTAMP(3),
    "weightSource" TEXT DEFAULT 'gestruck',
    "scaleId" TEXT,
    "warehouseId" TEXT,
    "supplierId2" TEXT,
    "providerShipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sacks" (
    "id" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "status" "SackStatus" NOT NULL DEFAULT 'EN_ALMACEN',
    "weight" DOUBLE PRECISION NOT NULL,
    "materialId" TEXT NOT NULL,
    "zoneId" TEXT,
    "containerId" TEXT,
    "lotId" TEXT,
    "notes" TEXT,
    "batchNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_lots" (
    "id" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "type" "LotType" NOT NULL,
    "materialId" TEXT NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformations" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "operatorId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transformations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformation_inputs" (
    "id" TEXT NOT NULL,
    "transformationId" TEXT NOT NULL,
    "sackId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transformation_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'BORRADOR',
    "buyerId" TEXT NOT NULL,
    "carrierId" TEXT,
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "notes" TEXT,
    "holdedAlbaranId" TEXT,
    "expeditedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_lots" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "shipment_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_sacks" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sackId" TEXT NOT NULL,

    CONSTRAINT "shipment_sacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "materialId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'ABIERTA',
    "orderedTons" DOUBLE PRECISION NOT NULL,
    "pricePerTon" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_shipments" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "billOfLading" TEXT,
    "origin" TEXT,
    "vessel" TEXT,
    "etaValencia" TIMESTAMP(3),
    "etaPlanta" TIMESTAMP(3),
    "arrivedValencia" TIMESTAMP(3),
    "arrivedPlanta" TIMESTAMP(3),
    "weightKg" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_records" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierId" TEXT,
    "shift" TEXT,
    "sampleType" TEXT,
    "result" "QualityResult" NOT NULL DEFAULT 'PENDIENTE',
    "overrideReason" TEXT,
    "density" DOUBLE PRECISION,
    "pvcPct" DOUBLE PRECISION,
    "gluePct" DOUBLE PRECISION,
    "multilayerPct" DOUBLE PRECISION,
    "metalPct" DOUBLE PRECISION,
    "otherPct" DOUBLE PRECISION,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumables" (
    "id" TEXT NOT NULL,
    "type" "ConsumableType" NOT NULL,
    "name" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'ud',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_movements" (
    "id" TEXT NOT NULL,
    "consumableId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "vehiclePlate" TEXT,
    "condition" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pallet_movements" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT,
    "vehiclePlate" TEXT,
    "shipmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pallet_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'ABIERTA',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "warehouseId" TEXT,
    "sackQrCode" TEXT,
    "photoUrl" TEXT,
    "reportedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "buyers_code_key" ON "buyers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "zones_warehouseId_idx" ON "zones"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_warehouseId_key" ON "zones"("code", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");

-- CreateIndex
CREATE UNIQUE INDEX "containers_reference_key" ON "containers"("reference");

-- CreateIndex
CREATE INDEX "containers_supplierId_idx" ON "containers"("supplierId");

-- CreateIndex
CREATE INDEX "containers_warehouseId_idx" ON "containers"("warehouseId");

-- CreateIndex
CREATE INDEX "containers_providerShipmentId_idx" ON "containers"("providerShipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sacks_qrCode_key" ON "sacks"("qrCode");

-- CreateIndex
CREATE INDEX "sacks_status_idx" ON "sacks"("status");

-- CreateIndex
CREATE INDEX "sacks_zoneId_idx" ON "sacks"("zoneId");

-- CreateIndex
CREATE INDEX "sacks_containerId_idx" ON "sacks"("containerId");

-- CreateIndex
CREATE INDEX "sacks_materialId_idx" ON "sacks"("materialId");

-- CreateIndex
CREATE INDEX "sacks_lotId_idx" ON "sacks"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "production_lots_lotNumber_key" ON "production_lots"("lotNumber");

-- CreateIndex
CREATE INDEX "production_lots_producedAt_idx" ON "production_lots"("producedAt");

-- CreateIndex
CREATE INDEX "production_lots_materialId_idx" ON "production_lots"("materialId");

-- CreateIndex
CREATE INDEX "transformations_lotId_idx" ON "transformations"("lotId");

-- CreateIndex
CREATE INDEX "transformation_inputs_transformationId_idx" ON "transformation_inputs"("transformationId");

-- CreateIndex
CREATE INDEX "transformation_inputs_sackId_idx" ON "transformation_inputs"("sackId");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_reference_key" ON "shipments"("reference");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE INDEX "shipments_buyerId_idx" ON "shipments"("buyerId");

-- CreateIndex
CREATE INDEX "shipments_carrierId_idx" ON "shipments"("carrierId");

-- CreateIndex
CREATE INDEX "shipment_lots_shipmentId_idx" ON "shipment_lots"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_lots_lotId_idx" ON "shipment_lots"("lotId");

-- CreateIndex
CREATE INDEX "shipment_sacks_shipmentId_idx" ON "shipment_sacks"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_sacks_sackId_idx" ON "shipment_sacks"("sackId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_shipments_billOfLading_key" ON "provider_shipments"("billOfLading");

-- CreateIndex
CREATE INDEX "provider_shipments_purchaseOrderId_idx" ON "provider_shipments"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "quality_records_lotId_idx" ON "quality_records"("lotId");

-- CreateIndex
CREATE INDEX "quality_records_materialId_idx" ON "quality_records"("materialId");

-- CreateIndex
CREATE INDEX "quality_records_supplierId_idx" ON "quality_records"("supplierId");

-- CreateIndex
CREATE INDEX "quality_records_recordedAt_idx" ON "quality_records"("recordedAt");

-- CreateIndex
CREATE INDEX "consumable_movements_consumableId_idx" ON "consumable_movements"("consumableId");

-- CreateIndex
CREATE INDEX "pallet_movements_buyerId_idx" ON "pallet_movements"("buyerId");

-- CreateIndex
CREATE INDEX "pallet_movements_shipmentId_idx" ON "pallet_movements"("shipmentId");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_providerShipmentId_fkey" FOREIGN KEY ("providerShipmentId") REFERENCES "provider_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sacks" ADD CONSTRAINT "sacks_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sacks" ADD CONSTRAINT "sacks_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sacks" ADD CONSTRAINT "sacks_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sacks" ADD CONSTRAINT "sacks_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "production_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_lots" ADD CONSTRAINT "production_lots_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformations" ADD CONSTRAINT "transformations_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "production_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_inputs" ADD CONSTRAINT "transformation_inputs_transformationId_fkey" FOREIGN KEY ("transformationId") REFERENCES "transformations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transformation_inputs" ADD CONSTRAINT "transformation_inputs_sackId_fkey" FOREIGN KEY ("sackId") REFERENCES "sacks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_lots" ADD CONSTRAINT "shipment_lots_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_lots" ADD CONSTRAINT "shipment_lots_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "production_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_sacks" ADD CONSTRAINT "shipment_sacks_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_sacks" ADD CONSTRAINT "shipment_sacks_sackId_fkey" FOREIGN KEY ("sackId") REFERENCES "sacks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_shipments" ADD CONSTRAINT "provider_shipments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "production_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_movements" ADD CONSTRAINT "consumable_movements_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "consumables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallet_movements" ADD CONSTRAINT "pallet_movements_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

