"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  createPurchaseOrder,
  createProviderShipment,
  markArrivedValencia,
  markArrivedPlanta,
} from "@/lib/services/procurement.service";

export type ActionState = { ok: boolean; error?: string; message?: string };

async function requireSession(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("No autenticado");
}

// ─── Crear orden de compra ──────────────────────────────────────────────────────
const createOrderSchema = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor"),
  materialId: z.string().optional(),
  orderedTons: z.coerce
    .number()
    .positive("Las toneladas deben ser mayores que 0"),
  notes: z.string().optional(),
});

export async function createPurchaseOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = createOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { materialId, ...rest } = parsed.data;
    const order = await createPurchaseOrder({
      ...rest,
      materialId: materialId || undefined,
    });
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: `Orden de compra ${order.poNumber} creada` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear la orden",
    };
  }
}

// ─── Crear envío de proveedor ─────────────────────────────────────────────────────
const createShipmentSchema = z.object({
  purchaseOrderId: z.string().min(1, "Selecciona una orden de compra"),
  billOfLading: z.string().optional(),
  origin: z.string().optional(),
  vessel: z.string().optional(),
  etaValencia: z.string().optional(),
  etaPlanta: z.string().optional(),
  weightKg: z.coerce.number().positive().optional(),
  numContainers: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional(),
});

export async function createShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = createShipmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { etaValencia, etaPlanta, billOfLading, origin, vessel, ...rest } =
      parsed.data;
    await createProviderShipment({
      ...rest,
      billOfLading: billOfLading || undefined,
      origin: origin || undefined,
      vessel: vessel || undefined,
      etaValencia: etaValencia ? new Date(etaValencia) : undefined,
      etaPlanta: etaPlanta ? new Date(etaPlanta) : undefined,
    });
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: "Envío registrado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al registrar el envío",
    };
  }
}

// ─── Hitos de tránsito ────────────────────────────────────────────────────────────
const shipmentIdSchema = z.object({ shipmentId: z.string().min(1) });

export async function markArrivedValenciaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = shipmentIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    await markArrivedValencia(parsed.data.shipmentId);
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: "Envío marcado como llegado a Valencia" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al actualizar el envío",
    };
  }
}

export async function markArrivedPlantaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = shipmentIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    await markArrivedPlanta(parsed.data.shipmentId);
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: "Envío marcado como llegado a planta" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al actualizar el envío",
    };
  }
}
