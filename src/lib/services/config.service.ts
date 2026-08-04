import { prisma } from "@/lib/prisma";
import { MaterialType, type Prisma } from "@prisma/client";

/**
 * Servicio de Configuración — CRUD de los catálogos maestros.
 * Lógica de negocio pura (funciones que usan `prisma`). Solo ADMIN.
 *
 * Regla general: "desactivar" en vez de borrar (soft-delete con active=false),
 * salvo Zone —que no tiene `active`— donde se permite borrar solo si no tiene sacas.
 */

// ─── Config clave/valor (tabla `Config`) ────────────────────────────────────────

/**
 * Lee un valor JSON de la tabla `Config` por clave. Devuelve `fallback` si la
 * clave no existe todavía. El llamador es responsable de validar la forma de `T`.
 */
export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.config.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

/** Upsert de un valor JSON en la tabla `Config` por clave. */
export async function setConfig(
  key: string,
  value: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

// ─── Materiales ────────────────────────────────────────────────────────────────

export type MaterialWithCategory = Prisma.MaterialGetPayload<{
  include: { category: true };
}>;

export function listMaterials(): Promise<MaterialWithCategory[]> {
  return prisma.material.findMany({
    include: { category: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export interface MaterialInput {
  name: string;
  code: string;
  // El "tipo físico" ya no se pide en el formulario (GL-53): la clasificación
  // va en la categoría. Opcional; en alta se guarda como OTRO y en edición se
  // conserva el valor existente.
  type?: MaterialType;
  description?: string;
  categoryId?: string;
}

export function createMaterial(input: MaterialInput): Promise<{ id: string }> {
  return prisma.material.create({
    data: {
      name: input.name,
      code: input.code,
      type: input.type ?? MaterialType.OTRO,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
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
      // Solo se toca el tipo si viene explícito; si no, se preserva.
      ...(input.type ? { type: input.type } : {}),
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
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

export interface CarrierInput {
  name: string;
  holdedId?: string;
}

export function createCarrier(input: CarrierInput): Promise<{ id: string }> {
  return prisma.carrier.create({
    data: { name: input.name, holdedId: input.holdedId ?? null },
    select: { id: true },
  });
}

export function updateCarrier(
  id: string,
  input: CarrierInput,
): Promise<{ id: string }> {
  return prisma.carrier.update({
    where: { id },
    data: { name: input.name, holdedId: input.holdedId ?? null },
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
