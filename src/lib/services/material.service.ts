import { prisma } from "@/lib/prisma";
import { MaterialKind, type MaterialCategory } from "@prisma/client";

/**
 * Servicio de Materiales / Tipos de material (GL-53).
 *
 * Gestiona el catálogo de `MaterialCategory` (tipos de material configurables)
 * y expone consultas de materiales por `kind` para que Producción y Recepción
 * filtren sus desplegables sin acoplarse al esquema.
 *
 * Regla general: "desactivar" en vez de borrar (soft-delete con active=false).
 */

// ─── Tipos de material (MaterialCategory) ───────────────────────────────────────

/** Tipos por defecto que se cargan si el catálogo está vacío. */
export const DEFAULT_MATERIAL_CATEGORIES: {
  name: string;
  kind: MaterialKind;
}[] = [
  { name: "Materia Prima", kind: MaterialKind.MATERIA_PRIMA },
  { name: "Producto Terminado", kind: MaterialKind.PRODUCTO_TERMINADO },
  { name: "Subproducto", kind: MaterialKind.SUBPRODUCTO },
  { name: "Rechazo", kind: MaterialKind.RECHAZO },
];

/** Lista todos los tipos de material (activos primero, luego por nombre). */
export function listMaterialCategories(): Promise<MaterialCategory[]> {
  return prisma.materialCategory.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

/** Lista solo los tipos de material activos (para desplegables de selección). */
export function listActiveMaterialCategories(): Promise<MaterialCategory[]> {
  return prisma.materialCategory.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
}

export interface MaterialCategoryInput {
  name: string;
  kind: MaterialKind;
}

export function createMaterialCategory(
  input: MaterialCategoryInput,
): Promise<{ id: string }> {
  return prisma.materialCategory.create({
    data: { name: input.name, kind: input.kind },
    select: { id: true },
  });
}

export function setMaterialCategoryActive(
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  return prisma.materialCategory.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
}

/**
 * Crea los tipos por defecto solo si el catálogo está vacío.
 * Devuelve cuántos se crearon (0 si ya había alguno).
 */
export async function seedDefaultMaterialCategories(): Promise<number> {
  const existing = await prisma.materialCategory.count();
  if (existing > 0) return 0;
  const result = await prisma.materialCategory.createMany({
    data: DEFAULT_MATERIAL_CATEGORIES,
  });
  return result.count;
}

// ─── Materiales por naturaleza (kind) ───────────────────────────────────────────

/**
 * Devuelve los materiales ACTIVOS cuya categoría tenga el `kind` indicado.
 * Lo consumen Producción y Recepción para filtrar sus desplegables.
 *
 * ⚠️ Firma estable: otros módulos la importan. No cambiar sin coordinar.
 */
export function getMaterialsByKind(
  kind: MaterialKind,
): Promise<{ id: string; name: string; code: string }[]> {
  return prisma.material.findMany({
    where: { active: true, category: { is: { kind, active: true } } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
}

/** Asigna (o desasigna con `null`) la categoría de un material. */
export function assignMaterialCategory(
  materialId: string,
  categoryId: string | null,
): Promise<{ id: string }> {
  return prisma.material.update({
    where: { id: materialId },
    data: { categoryId },
    select: { id: true },
  });
}
