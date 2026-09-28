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
import {
  createStockEntry,
  createStockExit,
  MAX_SACKS_PER_ADJUSTMENT,
} from "@/lib/services/stock-adjustment.service";
import { listStockEntrySacks, sackLabel } from "@/lib/services/qr.service";
import { enqueueLabels } from "@/lib/integrations/qr-printer";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  /** Alta de sacas: movimiento creado, para ofrecer imprimir sus etiquetas. */
  stockEntryId?: string;
  numSacks?: number;
};

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

// ─── Altas y bajas manuales de sacas ─────────────────────────────────────────────

const sackCount = z.coerce
  .number()
  .int("El número de sacas debe ser un número entero")
  .positive("El número de sacas debe ser mayor que 0")
  .max(
    MAX_SACKS_PER_ADJUSTMENT,
    `Como máximo ${MAX_SACKS_PER_ADJUSTMENT} sacas por movimiento`,
  );

const adjustmentDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha")
  // Mediodía: el día no se desplaza al formatearlo en otra zona horaria.
  .transform((v) => new Date(`${v}T12:00:00`));

const stockEntrySchema = z.object({
  materialId: z.string().min(1, "Selecciona el producto"),
  zoneId: z.string().min(1, "Selecciona la ubicación"),
  numSacks: sackCount,
  weightPerSack: z.coerce
    .number()
    .positive("El peso por saca debe ser mayor que 0"),
  date: adjustmentDate,
  notes: z.string().optional(),
});

/** Alta manual de sacas en almacén (stock inicial, material sin contenedor…). */
export async function createStockEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = stockEntrySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const res = await createStockEntry({
      ...parsed.data,
      notes: parsed.data.notes || undefined,
      userId: actor.id,
    });
    await logAudit({
      userId: actor.id,
      action: "STOCK_ENTRY",
      entity: "StockAdjustment",
      entityId: res.id,
      payload: {
        materialId: parsed.data.materialId,
        zoneId: parsed.data.zoneId,
        numSacks: res.numSacks,
        totalWeight: res.totalWeight,
      },
    });
    revalidatePath("/inventario");
    return {
      ok: true,
      message: `${res.numSacks} sacas dadas de alta (${res.totalWeight.toLocaleString("es-ES")} kg).`,
      stockEntryId: res.id,
      numSacks: res.numSacks,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al dar de alta las sacas",
    };
  }
}

const stockExitSchema = z.object({
  materialId: z.string().min(1, "Selecciona el producto"),
  zoneId: z.string().optional(),
  numSacks: sackCount,
  date: adjustmentDate,
  notes: z.string().optional(),
});

/** Baja manual: saca del stock las sacas en almacén más antiguas del producto. */
export async function createStockExitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = stockExitSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const res = await createStockExit({
      ...parsed.data,
      zoneId: parsed.data.zoneId || undefined,
      notes: parsed.data.notes || undefined,
      userId: actor.id,
    });
    await logAudit({
      userId: actor.id,
      action: "STOCK_EXIT",
      entity: "StockAdjustment",
      entityId: res.id,
      payload: {
        materialId: parsed.data.materialId,
        zoneId: parsed.data.zoneId || null,
        numSacks: res.numSacks,
        totalWeight: res.totalWeight,
      },
    });
    revalidatePath("/inventario");
    return {
      ok: true,
      message: `${res.numSacks} sacas dadas de baja (${res.totalWeight.toLocaleString("es-ES")} kg).`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al dar de baja las sacas",
    };
  }
}

/** Etiquetas por trabajo de impresión. */
const LABEL_BATCH = 25;

/** Imprime las etiquetas QR de todas las sacas de un alta manual. */
export async function printStockEntryLabelsAction(
  stockEntryId: string,
): Promise<{ ok: boolean; status?: string; message: string }> {
  try {
    await requireSession();
    const sacks = await listStockEntrySacks(stockEntryId);
    if (sacks.length === 0) {
      return { ok: false, message: "Este alta no tiene sacas." };
    }
    // Por tandas: un trabajo con cientos de etiquetas tarda en llegar a la
    // Zebra por el túnel y, si falla, se sabe cuántas han salido ya.
    const labels = sacks.map(sackLabel);
    let sent = 0;
    for (let i = 0; i < labels.length; i += LABEL_BATCH) {
      const batch = labels.slice(i, i + LABEL_BATCH);
      const result = await enqueueLabels(batch);
      if (result.simulated) {
        return {
          ok: true,
          status: "simulated",
          message: `Impresora no configurada — ${labels.length} etiquetas generadas, sin impresión física.`,
        };
      }
      if (result.error) {
        return {
          ok: false,
          status: "error",
          message: `${result.error}. Enviadas ${sent} de ${labels.length}; comprueba que la Zebra esté encendida y con papel.`,
        };
      }
      sent += batch.length;
    }
    return {
      ok: true,
      status: "queued",
      message: `${sent} etiquetas enviadas a la impresora.`,
    };
  } catch (e) {
    return {
      ok: false,
      status: "error",
      message:
        e instanceof Error
          ? e.message
          : "No se pudieron imprimir las etiquetas",
    };
  }
}
