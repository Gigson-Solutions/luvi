"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  startInventoryCount,
  scanSack,
  finishInventoryCount,
  getMissingSacks,
  type ScanResult,
  type FinishCountResult,
  type MissingSack,
} from "@/lib/services/inventory-count.service";
import {
  addBrokenPallets,
  shipBrokenPallets,
} from "@/lib/services/broken-pallet.service";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("inventario");
}

const startSchema = z.object({
  warehouseId: z.string().optional(),
  notes: z.string().optional(),
});

/** Abre una sesión de inventario por escaneo. */
export async function startInventoryCountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = startSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Datos inválidos" };
    const count = await startInventoryCount({
      warehouseId: parsed.data.warehouseId || undefined,
      userId: actor.id,
      notes: parsed.data.notes || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "START_INVENTORY_COUNT",
      entity: "InventoryCount",
      entityId: count.id,
      payload: { warehouseId: parsed.data.warehouseId ?? null },
    });
    revalidatePath("/inventario");
    return { ok: true, message: "Inventario iniciado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al iniciar el inventario",
    };
  }
}

/** Registra el escaneo de una saca en la sesión abierta. */
export async function scanSackAction(
  countId: string,
  qrCode: string,
): Promise<{ ok: boolean; result?: ScanResult; error?: string }> {
  try {
    await requireSession();
    const result = await scanSack(countId, qrCode);
    revalidatePath("/inventario");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al registrar el escaneo",
    };
  }
}

/** Sacas que faltaron en un recuento ya cerrado. */
export async function getMissingSacksAction(
  countId: string,
): Promise<{ ok: boolean; missing?: MissingSack[]; error?: string }> {
  try {
    await requireSession();
    return { ok: true, missing: await getMissingSacks(countId) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al leer el recuento",
    };
  }
}

/** Cierra la sesión y devuelve el resultado (qué sacas faltan). */
export async function finishInventoryCountAction(
  countId: string,
): Promise<{ ok: boolean; result?: FinishCountResult; error?: string }> {
  try {
    const actor = await requireSession();
    const result = await finishInventoryCount(countId);
    await logAudit({
      userId: actor.id,
      action: "FINISH_INVENTORY_COUNT",
      entity: "InventoryCount",
      entityId: countId,
      payload: {
        expected: result.expectedCount,
        scanned: result.scannedCount,
        missing: result.missingCount,
      },
    });
    revalidatePath("/inventario");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Error al finalizar el inventario",
    };
  }
}

// ─── Palés rotos ────────────────────────────────────────────────────────────────

const addBrokenSchema = z.object({
  quantity: z.coerce
    .number()
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser mayor que 0"),
  notes: z.string().optional(),
});

/** Entrada manual de palés rotos al stock. */
export async function addBrokenPalletsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = addBrokenSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const stock = await addBrokenPallets({
      quantity: parsed.data.quantity,
      notes: parsed.data.notes || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "ADD_BROKEN_PALLETS",
      entity: "BrokenPalletMovement",
      payload: { quantity: parsed.data.quantity, stock },
    });
    revalidatePath("/inventario");
    return {
      ok: true,
      message: `${parsed.data.quantity} palés rotos añadidos (disponibles: ${stock})`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al añadir palés rotos",
    };
  }
}

const shipBrokenSchema = z.object({
  buyerId: z.string().min(1, "Selecciona el destinatario"),
  quantity: z.coerce
    .number()
    .int("La cantidad debe ser un número entero")
    .positive("La cantidad debe ser mayor que 0"),
  notes: z.string().optional(),
});

/** Salida de palés rotos: descuenta del stock y genera el albarán en Holded. */
export async function shipBrokenPalletsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = shipBrokenSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const res = await shipBrokenPallets({
      buyerId: parsed.data.buyerId,
      quantity: parsed.data.quantity,
      notes: parsed.data.notes || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "SHIP_BROKEN_PALLETS",
      entity: "BrokenPalletMovement",
      entityId: res.reference,
      payload: {
        buyerId: parsed.data.buyerId,
        quantity: parsed.data.quantity,
        holdedAlbaranId: res.holdedAlbaranId,
        simulated: res.simulated,
      },
    });
    revalidatePath("/inventario");
    return {
      ok: true,
      message: `Salida ${res.reference} registrada (albarán ${res.holdedAlbaranId ?? "—"}). Quedan ${res.stock} palés rotos.`,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Error al registrar la salida de palés rotos",
    };
  }
}
