"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  findMovableSackByQr,
  moveSack,
  setSackSupplier,
  setSuppliersForFilteredSacks,
  transferSacks,
  type MovableSackData,
} from "@/lib/services/warehouse.service";
import { resolveStatusFilter } from "./filter-params";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("almacen");
}

const moveSchema = z.object({
  sackId: z.string().min(1),
  zoneId: z.string().min(1, "Selecciona una zona destino"),
});

/** Traslada una saca a otra zona, validando la capacidad de la zona destino. */
export async function moveSackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = moveSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    await moveSack(parsed.data);
    await logAudit({
      userId: actor.id,
      action: "MOVE_SACK",
      entity: "Sack",
      entityId: parsed.data.sackId,
      payload: { zoneId: parsed.data.zoneId },
    });
    revalidatePath("/almacen");
    revalidatePath(`/almacen/${parsed.data.sackId}`);
    return { ok: true, message: "Saca trasladada" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al trasladar la saca",
    };
  }
}

/**
 * Resuelve un QR a una saca EN_ALMACEN para el modo "Escanear" (pistoleo) del
 * traslado múltiple. Devuelve los datos de la saca para acumularla en la lista.
 */
export async function findWarehouseSackByQrAction(
  qrCode: string,
): Promise<{ ok: boolean; sack?: MovableSackData; error?: string }> {
  try {
    await requireSession();
    const trimmed = qrCode.trim();
    if (!trimmed) return { ok: false, error: "Código QR vacío" };
    const sack = await findMovableSackByQr(trimmed);
    if (!sack) {
      return {
        ok: false,
        error: "No se encontró ninguna saca en almacén con ese QR.",
      };
    }
    return { ok: true, sack };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al buscar la saca",
    };
  }
}

const transferSchema = z.object({
  zoneId: z.string().min(1, "Selecciona una zona destino"),
  sackIds: z.array(z.string().min(1)).min(1, "Selecciona al menos una saca"),
});

/**
 * Traslada varias sacas a una zona destino. Si es entre plantas (La Gineta ↔
 * Montalbos) genera un albarán en Holded a nombre de la planta destino.
 */
export async function transferSacksAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = transferSchema.safeParse({
      zoneId: formData.get("zoneId"),
      sackIds: formData.getAll("sackIds"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const res = await transferSacks(parsed.data);
    await logAudit({
      userId: actor.id,
      action: "TRANSFER_SACKS",
      entity: "Sack",
      entityId: parsed.data.sackIds[0],
      payload: {
        zoneId: parsed.data.zoneId,
        sackIds: parsed.data.sackIds,
        movedCount: res.movedCount,
        interWarehouse: res.interWarehouse,
      },
    });
    revalidatePath("/almacen");

    let message = `${res.movedCount} saca(s) trasladada(s)`;
    if (res.interWarehouse && res.albaran) {
      if (res.albaran.generated) {
        message += res.albaran.simulated
          ? " · albarán Holded generado (simulado)"
          : ` · albarán Holded ${res.albaran.holdedId ?? "generado"}`;
      } else {
        message += ` · aviso: el albarán no se pudo generar (${res.albaran.error ?? "error Holded"})`;
      }
    }
    return { ok: true, message };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al trasladar las sacas",
    };
  }
}

const sackSupplierSchema = z.object({
  sackId: z.string().min(1),
  // "" = quitar el proveedor asignado.
  supplierId: z.string().optional(),
});

/** Asigna (o quita) el proveedor de una saca sin contenedor, desde su ficha. */
export async function setSackSupplierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = sackSupplierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const supplierId = parsed.data.supplierId || null;
    await setSackSupplier(parsed.data.sackId, supplierId);
    await logAudit({
      userId: actor.id,
      action: "SET_SACK_SUPPLIER",
      entity: "Sack",
      entityId: parsed.data.sackId,
      payload: { supplierId },
    });
    revalidatePath("/almacen");
    revalidatePath(`/almacen/${parsed.data.sackId}`);
    revalidatePath("/inventario");
    return { ok: true, message: "Proveedor actualizado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al asignar el proveedor",
    };
  }
}

/**
 * Asigna un proveedor a todas las sacas sin contenedor que cumplan los filtros
 * que está viendo el usuario (no solo a la página visible). Los filtros llegan
 * como los parámetros de la URL de Almacén.
 */
export async function setSuppliersForFilteredAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const supplierId = String(formData.get("supplierId") ?? "");
    if (!supplierId) return { ok: false, error: "Selecciona un proveedor" };

    const list = (key: string): string[] =>
      formData.getAll(key).map(String).filter(Boolean);
    const filters = {
      status: resolveStatusFilter(list("status")),
      categoryId: list("tipo"),
      materialId: list("material"),
      zoneId: list("zone"),
      supplierId: list("proveedor"),
      search: String(formData.get("q") ?? "").trim() || undefined,
    };
    const count = await setSuppliersForFilteredSacks(filters, supplierId);
    await logAudit({
      userId: actor.id,
      action: "SET_SACKS_SUPPLIER_BULK",
      entity: "Sack",
      payload: { supplierId, count, filters },
    });
    revalidatePath("/almacen");
    revalidatePath("/inventario");
    return {
      ok: true,
      message: `Proveedor asignado a ${count} saca${count === 1 ? "" : "s"}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al asignar el proveedor",
    };
  }
}
