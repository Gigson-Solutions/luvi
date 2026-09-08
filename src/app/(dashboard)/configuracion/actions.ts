"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import type { CurrentUser } from "@/lib/rbac";
import { SAMPLE_MEASURE_KEYS } from "@/app/(dashboard)/calidad/quality-thresholds";
import type {
  ParamRange,
  SampleMeasureKey,
} from "@/app/(dashboard)/calidad/quality-thresholds";
import {
  createMaterial,
  updateMaterial,
  setMaterialActive,
  createSupplier,
  updateSupplier,
  setSupplierActive,
  createBuyer,
  updateBuyer,
  setBuyerActive,
  createCarrier,
  updateCarrier,
  setCarrierActive,
  createWarehouse,
  updateWarehouse,
  setWarehouseActive,
  createZone,
  updateZone,
  deleteZone,
  setConfig,
} from "@/lib/services/config.service";
import {
  createMaterialCategory,
  setMaterialCategoryActive,
  setMaterialCategoryQualityRangeSet,
  seedDefaultMaterialCategories,
  deriveMaterialKind,
} from "@/lib/services/material.service";
import {
  saveQualityRangeSet,
  deleteQualityRangeSet,
} from "@/lib/services/quality.service";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("configuracion");
}

function fail(e: unknown, fallback: string): ActionState {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

const REVALIDATE = "/configuracion";

// ─── Materiales ────────────────────────────────────────────────────────────────

const materialSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  code: z.string().min(1, "El código es obligatorio"),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  qualityRangeSetId: z.string().optional(),
});

/**
 * Consumibles predeterminados marcados en el formulario del producto. Cada uno
 * llega como `cons_<id>` (marcado) + `consQty_<id>` (cantidad por saca).
 */
function readDefaultConsumables(
  formData: FormData,
): { consumableId: string; quantity: number }[] {
  const items: { consumableId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("cons_") || value === "") continue;
    const consumableId = key.slice("cons_".length);
    const qty = Number(formData.get(`consQty_${consumableId}`) ?? 1);
    items.push({
      consumableId,
      quantity: Number.isFinite(qty) && qty > 0 ? Math.trunc(qty) : 1,
    });
  }
  return items;
}

export async function saveMaterialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = materialSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { id, description, categoryId, qualityRangeSetId, ...rest } =
      parsed.data;
    const input = {
      ...rest,
      description: description || undefined,
      categoryId: categoryId || undefined,
      qualityRangeSetId: qualityRangeSetId || undefined,
      defaultConsumables: readDefaultConsumables(formData),
    };
    // Crea o actualiza según venga id, y usa el id resultante para la traza.
    const result = id
      ? await updateMaterial(id, input)
      : await createMaterial(input);
    await logAudit({
      userId: actor.id,
      action: id ? "UPDATE_MATERIAL" : "CREATE_MATERIAL",
      entity: "Material",
      entityId: result.id,
      payload: { name: input.name, code: input.code },
    });
    revalidatePath(REVALIDATE);
    return {
      ok: true,
      message: id ? "Material actualizado" : "Material creado",
    };
  } catch (e) {
    return fail(e, "Error al guardar el material");
  }
}

// ─── Tipos de material (MaterialCategory) ────────────────────────────────────────

const materialCategorySchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  qualityRangeSetId: z.string().optional(),
});

export async function saveMaterialCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = materialCategorySchema.safeParse(
      Object.fromEntries(formData),
    );
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    // El "kind" (papel en el flujo) se deduce del nombre: ya no es un campo
    // del formulario (GL-53, "la info va en el nombre").
    const kind = deriveMaterialKind(parsed.data.name);
    const result = await createMaterialCategory({
      name: parsed.data.name,
      kind,
      qualityRangeSetId: parsed.data.qualityRangeSetId || null,
    });
    await logAudit({
      userId: actor.id,
      action: "CREATE_MATERIAL_CATEGORY",
      entity: "MaterialCategory",
      entityId: result.id,
      payload: { name: parsed.data.name, kind },
    });
    revalidatePath(REVALIDATE);
    return { ok: true, message: "Tipo de material creado" };
  } catch (e) {
    return fail(e, "Error al guardar el tipo de material");
  }
}

/** Carga los tipos de material por defecto si el catálogo está vacío. */
export async function seedMaterialCategoriesAction(): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const count = await seedDefaultMaterialCategories();
    if (count === 0) {
      return { ok: false, error: "Ya existen tipos de material" };
    }
    await logAudit({
      userId: actor.id,
      action: "SEED_MATERIAL_CATEGORIES",
      entity: "MaterialCategory",
      entityId: "default",
      payload: { count },
    });
    revalidatePath(REVALIDATE);
    return { ok: true, message: `${count} tipos de material cargados` };
  } catch (e) {
    return fail(e, "Error al cargar los tipos por defecto");
  }
}

// ─── Proveedores ───────────────────────────────────────────────────────────────

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  code: z.string().min(1, "El código es obligatorio"),
  country: z.string().min(1, "El país es obligatorio"),
  notes: z.string().optional(),
});

export async function saveSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { id, notes, ...rest } = parsed.data;
    const input = { ...rest, notes: notes || undefined };
    // Crea o actualiza según venga id, y usa el id resultante para la traza.
    const result = id
      ? await updateSupplier(id, input)
      : await createSupplier(input);
    await logAudit({
      userId: actor.id,
      action: id ? "UPDATE_SUPPLIER" : "CREATE_SUPPLIER",
      entity: "Supplier",
      entityId: result.id,
      payload: { name: input.name, code: input.code },
    });
    revalidatePath(REVALIDATE);
    return {
      ok: true,
      message: id ? "Proveedor actualizado" : "Proveedor creado",
    };
  } catch (e) {
    return fail(e, "Error al guardar el proveedor");
  }
}

// ─── Compradores ───────────────────────────────────────────────────────────────

const buyerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  code: z.string().min(1, "El código es obligatorio"),
  country: z.string().min(1, "El país es obligatorio"),
  notes: z.string().optional(),
  holdedId: z.string().optional(),
});

export async function saveBuyerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = buyerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { id, notes, holdedId, ...rest } = parsed.data;
    const input = {
      ...rest,
      notes: notes || undefined,
      holdedId: holdedId || undefined,
    };
    // Crea o actualiza según venga id, y usa el id resultante para la traza.
    const result = id ? await updateBuyer(id, input) : await createBuyer(input);
    await logAudit({
      userId: actor.id,
      action: id ? "UPDATE_BUYER" : "CREATE_BUYER",
      entity: "Buyer",
      entityId: result.id,
      payload: { name: input.name, code: input.code },
    });
    revalidatePath(REVALIDATE);
    return {
      ok: true,
      message: id ? "Comprador actualizado" : "Comprador creado",
    };
  } catch (e) {
    return fail(e, "Error al guardar el comprador");
  }
}

// ─── Transportistas ────────────────────────────────────────────────────────────

const carrierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  holdedId: z.string().optional(),
});

export async function saveCarrierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = carrierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { id, name, holdedId } = parsed.data;
    const input = { name, holdedId: holdedId || undefined };
    // Crea o actualiza según venga id, y usa el id resultante para la traza.
    const result = id
      ? await updateCarrier(id, input)
      : await createCarrier(input);
    await logAudit({
      userId: actor.id,
      action: id ? "UPDATE_CARRIER" : "CREATE_CARRIER",
      entity: "Carrier",
      entityId: result.id,
      payload: { name },
    });
    revalidatePath(REVALIDATE);
    return {
      ok: true,
      message: id ? "Transportista actualizado" : "Transportista creado",
    };
  } catch (e) {
    return fail(e, "Error al guardar el transportista");
  }
}

// ─── Almacenes ─────────────────────────────────────────────────────────────────

const warehouseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  code: z.string().min(1, "El código es obligatorio"),
  location: z.string().optional(),
});

export async function saveWarehouseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = warehouseSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { id, location, ...rest } = parsed.data;
    const input = { ...rest, location: location || undefined };
    // Crea o actualiza según venga id, y usa el id resultante para la traza.
    const result = id
      ? await updateWarehouse(id, input)
      : await createWarehouse(input);
    await logAudit({
      userId: actor.id,
      action: id ? "UPDATE_WAREHOUSE" : "CREATE_WAREHOUSE",
      entity: "Warehouse",
      entityId: result.id,
      payload: { name: input.name, code: input.code },
    });
    revalidatePath(REVALIDATE);
    return { ok: true, message: id ? "Almacén actualizado" : "Almacén creado" };
  } catch (e) {
    return fail(e, "Error al guardar el almacén");
  }
}

// ─── Zonas ─────────────────────────────────────────────────────────────────────

const zoneSchema = z.object({
  id: z.string().optional(),
  warehouseId: z.string().min(1, "Selecciona un almacén"),
  name: z.string().min(1, "El nombre es obligatorio"),
  code: z.string().min(1, "El código es obligatorio"),
  maxCapacity: z.coerce
    .number()
    .int()
    .positive("La capacidad debe ser mayor que 0"),
});

export async function saveZoneAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = zoneSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { id, warehouseId, name, code, maxCapacity } = parsed.data;
    // Crea o actualiza según venga id, y usa el id resultante para la traza.
    const result = id
      ? await updateZone(id, { name, code, maxCapacity })
      : await createZone({ warehouseId, name, code, maxCapacity });
    await logAudit({
      userId: actor.id,
      action: id ? "UPDATE_ZONE" : "CREATE_ZONE",
      entity: "Zone",
      entityId: result.id,
      payload: { name, code, warehouseId },
    });
    revalidatePath(REVALIDATE);
    return { ok: true, message: id ? "Zona actualizada" : "Zona creada" };
  } catch (e) {
    return fail(e, "Error al guardar la zona");
  }
}

const deleteZoneSchema = z.object({ id: z.string().min(1) });

export async function deleteZoneAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = deleteZoneSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Datos inválidos" };
    await deleteZone(parsed.data.id);
    await logAudit({
      userId: actor.id,
      action: "DELETE_ZONE",
      entity: "Zone",
      entityId: parsed.data.id,
    });
    revalidatePath(REVALIDATE);
    return { ok: true, message: "Zona eliminada" };
  } catch (e) {
    return fail(e, "Error al eliminar la zona");
  }
}

// ─── Activar / desactivar (soft-delete genérico) ────────────────────────────────

const toggleSchema = z.object({
  entity: z.enum([
    "material",
    "materialCategory",
    "supplier",
    "buyer",
    "carrier",
    "warehouse",
  ]),
  id: z.string().min(1),
  active: z.enum(["true", "false"]),
});

export async function toggleActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Datos inválidos" };
    const { entity, id } = parsed.data;
    const active = parsed.data.active === "true";
    // Nombre de entidad para la traza según el tipo alternado.
    const auditEntity = {
      material: "Material",
      materialCategory: "MaterialCategory",
      supplier: "Supplier",
      buyer: "Buyer",
      carrier: "Carrier",
      warehouse: "Warehouse",
    }[entity];
    switch (entity) {
      case "material":
        await setMaterialActive(id, active);
        break;
      case "materialCategory":
        await setMaterialCategoryActive(id, active);
        break;
      case "supplier":
        await setSupplierActive(id, active);
        break;
      case "buyer":
        await setBuyerActive(id, active);
        break;
      case "carrier":
        await setCarrierActive(id, active);
        break;
      case "warehouse":
        await setWarehouseActive(id, active);
        break;
    }
    await logAudit({
      userId: actor.id,
      action: "SET_ACTIVE",
      entity: auditEntity,
      entityId: id,
      payload: { active },
    });
    revalidatePath(REVALIDATE);
    return { ok: true, message: active ? "Activado" : "Desactivado" };
  } catch (e) {
    return fail(e, "Error al cambiar el estado");
  }
}

// ─── Calidad (rangos) ────────────────────────────────────────────────────────────

/** Lee un campo numérico opcional del form: vacío → null, no numérico → "invalid". */
function parseOptionalNumber(
  raw: FormDataEntryValue | null,
): number | null | "invalid" {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : "invalid";
}

/**
 * Guarda los rangos de calidad (min/max por parámetro) en `config.quality_ranges`.
 * La forma persistida coincide con la que lee `quality.service.getQualityRanges`.
 */
export async function saveQualityRangesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const ranges: Record<SampleMeasureKey, ParamRange> = {} as Record<
      SampleMeasureKey,
      ParamRange
    >;
    for (const key of SAMPLE_MEASURE_KEYS) {
      const min = parseOptionalNumber(formData.get(`${key}_min`));
      const max = parseOptionalNumber(formData.get(`${key}_max`));
      if (min === "invalid" || max === "invalid") {
        return { ok: false, error: "Los rangos deben ser numéricos" };
      }
      if (min != null && max != null && min > max) {
        return {
          ok: false,
          error: "El mínimo no puede ser mayor que el máximo",
        };
      }
      ranges[key] = { min, max };
    }
    await setConfig("quality_ranges", ranges);
    await logAudit({
      userId: actor.id,
      action: "UPDATE_QUALITY_RANGES",
      entity: "Config",
      entityId: "quality_ranges",
      payload: ranges,
    });
    revalidatePath(REVALIDATE);
    revalidatePath("/calidad");
    return { ok: true, message: "Rangos de calidad guardados" };
  } catch (e) {
    return fail(e, "Error al guardar los rangos de calidad");
  }
}

// ─── Calidad (conjuntos de rangos por producto/categoría) ────────────────────────

/** Lee los 6 pares min/max del formulario y valida que min ≤ max. */
function readRangesFromForm(
  formData: FormData,
): Record<SampleMeasureKey, ParamRange> | { error: string } {
  const ranges = {} as Record<SampleMeasureKey, ParamRange>;
  for (const key of SAMPLE_MEASURE_KEYS) {
    const min = parseOptionalNumber(formData.get(`${key}_min`));
    const max = parseOptionalNumber(formData.get(`${key}_max`));
    if (min === "invalid" || max === "invalid") {
      return { error: "Los rangos deben ser numéricos" };
    }
    if (min != null && max != null && min > max) {
      return { error: "El mínimo no puede ser mayor que el máximo" };
    }
    ranges[key] = { min, max };
  }
  return ranges;
}

/** Crea o actualiza un conjunto de rangos de calidad reutilizable. */
export async function saveQualityRangeSetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "El nombre es obligatorio" };
    const ranges = readRangesFromForm(formData);
    if ("error" in ranges) return { ok: false, error: ranges.error };

    const set = await saveQualityRangeSet({
      id: id || undefined,
      name,
      active: formData.get("active") !== "false",
      ranges,
    });
    await logAudit({
      userId: actor.id,
      action: id ? "UPDATE_QUALITY_RANGE_SET" : "CREATE_QUALITY_RANGE_SET",
      entity: "QualityRangeSet",
      entityId: set.id,
      payload: { name },
    });
    revalidatePath(REVALIDATE);
    revalidatePath("/calidad");
    return { ok: true, message: id ? "Conjunto guardado" : "Conjunto creado" };
  } catch (e) {
    return fail(e, "Error al guardar el conjunto de rangos");
  }
}

/** Borra un conjunto; los productos/categorías que lo usaban se quedan sin él. */
export async function deleteQualityRangeSetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, error: "Conjunto inválido" };
    await deleteQualityRangeSet(id);
    await logAudit({
      userId: actor.id,
      action: "DELETE_QUALITY_RANGE_SET",
      entity: "QualityRangeSet",
      entityId: id,
    });
    revalidatePath(REVALIDATE);
    revalidatePath("/calidad");
    return { ok: true, message: "Conjunto eliminado" };
  } catch (e) {
    return fail(e, "Error al eliminar el conjunto de rangos");
  }
}

/** Asigna (o quita) el conjunto de rangos de un tipo de material. */
export async function setCategoryRangeSetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const id = String(formData.get("id") ?? "");
    const setId = String(formData.get("qualityRangeSetId") ?? "");
    if (!id) return { ok: false, error: "Tipo de material inválido" };
    await setMaterialCategoryQualityRangeSet(id, setId || null);
    await logAudit({
      userId: actor.id,
      action: "UPDATE_MATERIAL_CATEGORY",
      entity: "MaterialCategory",
      entityId: id,
      payload: { qualityRangeSetId: setId || null },
    });
    revalidatePath(REVALIDATE);
    revalidatePath("/calidad");
    return { ok: true, message: "Rangos del tipo actualizados" };
  } catch (e) {
    return fail(e, "Error al asignar los rangos");
  }
}

// ─── Costes ────────────────────────────────────────────────────────────────────

const costsSchema = z.object({
  processingPerSack: z.coerce.number().min(0, "El coste no puede ser negativo"),
  palletCost: z.coerce.number().min(0, "El coste no puede ser negativo"),
  emptySackCost: z.coerce.number().min(0, "El coste no puede ser negativo"),
});

/** Guarda los costes fijos (procesado, palé, saca vacía) en `config.costs`. */
export async function saveCostsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = costsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    await setConfig("costs", parsed.data);
    await logAudit({
      userId: actor.id,
      action: "UPDATE_COSTS",
      entity: "Config",
      entityId: "costs",
      payload: parsed.data,
    });
    revalidatePath(REVALIDATE);
    return { ok: true, message: "Costes guardados" };
  } catch (e) {
    return fail(e, "Error al guardar los costes");
  }
}
