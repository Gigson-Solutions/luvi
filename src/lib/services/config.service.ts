import { prisma } from "@/lib/prisma";
import { MaterialType, type Prisma } from "@prisma/client";

/**
 * Servicio de Configuración — CRUD de los catálogos maestros.
 * Lógica de negocio pura (funciones que usan `prisma`). Solo ADMIN.
 *
 * Regla general: "desactivar" en vez de borrar (soft-delete con active=false),
 * salvo Zone —que no tiene `active`— donde se permite borrar solo si no tiene sacas.
 */

// ─── Materiales ────────────────────────────────────────────────────────────────

export function listMaterials(): Promise<
  Prisma.MaterialGetPayload<Record<string, never>>[]
> {
  return prisma.material.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export interface MaterialInput {
  name: string;
  code: string;
  type: MaterialType;
  description?: string;
}

export function createMaterial(input: MaterialInput): Promise<{ id: string }> {
  return prisma.material.create({
    data: {
      name: input.name,
      code: input.code,
      type: input.type,
      description: input.description ?? null,
    },
    select: { id: true },
  });
}

export function updateMaterial(
  id: string,
  input: MaterialInput,
): Promise<{ id: string }> {
  return prisma.material.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      type: input.type,
      description: input.description ?? null,
    },
    select: { id: true },
  });
}

export function setMaterialActive(
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  return prisma.material.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
}

// ─── Proveedores ───────────────────────────────────────────────────────────────

export function listSuppliers(): Promise<
  Prisma.SupplierGetPayload<Record<string, never>>[]
> {
  return prisma.supplier.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export interface SupplierInput {
  name: string;
  code: string;
  country: string;
  notes?: string;
}

export function createSupplier(input: SupplierInput): Promise<{ id: string }> {
  return prisma.supplier.create({
    data: {
      name: input.name,
      code: input.code,
      country: input.country,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });
}

export function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<{ id: string }> {
  return prisma.supplier.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      country: input.country,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });
}

export function setSupplierActive(
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  return prisma.supplier.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
}

// ─── Compradores ───────────────────────────────────────────────────────────────

export function listBuyers(): Promise<
  Prisma.BuyerGetPayload<Record<string, never>>[]
> {
  return prisma.buyer.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export interface BuyerInput {
  name: string;
  code: string;
  country: string;
  notes?: string;
  holdedId?: string;
}

export function createBuyer(input: BuyerInput): Promise<{ id: string }> {
  return prisma.buyer.create({
    data: {
      name: input.name,
      code: input.code,
      country: input.country,
      notes: input.notes ?? null,
      holdedId: input.holdedId ?? null,
    },
    select: { id: true },
  });
}

export function updateBuyer(
  id: string,
  input: BuyerInput,
): Promise<{ id: string }> {
  return prisma.buyer.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      country: input.country,
      notes: input.notes ?? null,
      holdedId: input.holdedId ?? null,
    },
    select: { id: true },
  });
}

export function setBuyerActive(
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  return prisma.buyer.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
}

// ─── Transportistas ────────────────────────────────────────────────────────────

export function listCarriers(): Promise<
  Prisma.CarrierGetPayload<Record<string, never>>[]
> {
  return prisma.carrier.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export function createCarrier(input: {
  name: string;
}): Promise<{ id: string }> {
  return prisma.carrier.create({
    data: { name: input.name },
    select: { id: true },
  });
}

export function updateCarrier(
  id: string,
  input: { name: string },
): Promise<{ id: string }> {
  return prisma.carrier.update({
    where: { id },
    data: { name: input.name },
    select: { id: true },
  });
}

export function setCarrierActive(
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  return prisma.carrier.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
}

// ─── Almacenes y Zonas ─────────────────────────────────────────────────────────

export type WarehouseWithZones = Prisma.WarehouseGetPayload<{
  include: { zones: { include: { _count: { select: { sacks: true } } } } };
}>;

export function listWarehouses(): Promise<WarehouseWithZones[]> {
  return prisma.warehouse.findMany({
    include: {
      zones: {
        include: { _count: { select: { sacks: true } } },
        orderBy: { code: "asc" },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export interface WarehouseInput {
  name: string;
  code: string;
  location?: string;
}

export function createWarehouse(
  input: WarehouseInput,
): Promise<{ id: string }> {
  return prisma.warehouse.create({
    data: {
      name: input.name,
      code: input.code,
      location: input.location ?? null,
    },
    select: { id: true },
  });
}

export function updateWarehouse(
  id: string,
  input: WarehouseInput,
): Promise<{ id: string }> {
  return prisma.warehouse.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      location: input.location ?? null,
    },
    select: { id: true },
  });
}

export function setWarehouseActive(
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  return prisma.warehouse.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
}

export interface ZoneInput {
  name: string;
  code: string;
  maxCapacity: number;
  warehouseId: string;
}

export function createZone(input: ZoneInput): Promise<{ id: string }> {
  return prisma.zone.create({
    data: {
      name: input.name,
      code: input.code,
      maxCapacity: input.maxCapacity,
      warehouseId: input.warehouseId,
    },
    select: { id: true },
  });
}

export function updateZone(
  id: string,
  input: { name: string; code: string; maxCapacity: number },
): Promise<{ id: string }> {
  return prisma.zone.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      maxCapacity: input.maxCapacity,
    },
    select: { id: true },
  });
}

/** Borra una zona solo si no tiene sacas asociadas. */
export async function deleteZone(id: string): Promise<void> {
  const count = await prisma.sack.count({ where: { zoneId: id } });
  if (count > 0) {
    throw new Error(
      "No se puede borrar una zona con sacas. Reubica las sacas primero.",
    );
  }
  await prisma.zone.delete({ where: { id } });
}
