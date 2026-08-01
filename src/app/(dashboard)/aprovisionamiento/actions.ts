"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createPurchaseOrder,
  createProviderShipment,
  markArrivedValencia,
  markArrivedPlanta,
} from "@/lib/services/procurement.service";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("aprovisionamiento");
}

// ─── Crear orden de compra ──────────────────────────────────────────────────────
const createOrderSchema = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor"),
  materialId: z.string().optional(),
  orderedTons: z.coerce
    .number()
    .positive("Las toneladas deben ser mayores que 0"),
  originPort: z.string().optional(),
  totalPrice: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce
      .number()
      .nonnegative("El precio total no puede ser negativo")
      .optional(),
  ),
  notes: z.string().optional(),
});

export async function createPurchaseOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = createOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { materialId, originPort, ...rest } = parsed.data;
    const order = await createPurchaseOrder({
      ...rest,
      materialId: materialId || undefined,
      originPort: originPort || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "CREATE_PURCHASE_ORDER",
      entity: "PurchaseOrder",
      entityId: order.id,
      payload: { poNumber: order.poNumber },
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
const shipmentContainerSchema = z.object({
  billOfLading: z.string().trim().min(1, "El BL es obligatorio"),
  reference: z.string().trim().min(1, "El nº de contenedor es obligatorio"),
  // Peso individual del contenedor en kg (GL-57). Opcional.
  weight: z.coerce
    .number()
    .nonnegative("El peso no puede ser negativo")
    .optional(),
});

const createShipmentSchema = z.object({
  purchaseOrderId: z.string().min(1, "Selecciona una orden de compra"),
  // Fecha de salida (opcional, informativa) — GL-50.
  departureDate: z.string().optional(),
  // ETAs elegidas directamente como fechas (GL-50).
  etaValencia: z
    .string()
    .min(1, "La fecha de llegada a Valencia es obligatoria"),
  etaPlanta: z.string().min(1, "La fecha de llegada a planta es obligatoria"),
  // Pares BL ↔ Contenedor (con peso) serializados como JSON desde el formulario.
  containers: z
    .string()
    .min(1, "Añade al menos un contenedor")
    .transform((raw, ctx) => {
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Contenedores inválidos",
        });
        return z.NEVER;
      }
      const result = z.array(shipmentContainerSchema).min(1).safeParse(value);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            result.error.issues[0]?.message ??
            "Añade al menos un contenedor con BL y nº",
        });
        return z.NEVER;
      }
      return result.data;
    }),
  notes: z.string().optional(),
});

export async function createShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = createShipmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { departureDate, etaValencia, etaPlanta, ...rest } = parsed.data;
    const shipment = await createProviderShipment({
      ...rest,
      departureDate: departureDate ? new Date(departureDate) : undefined,
      etaValencia: new Date(etaValencia),
      etaPlanta: new Date(etaPlanta),
    });
    await logAudit({
      userId: actor.id,
      action: "CREATE_PROVIDER_SHIPMENT",
      entity: "ProviderShipment",
      entityId: shipment.id,
      payload: { purchaseOrderId: shipment.purchaseOrderId },
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
    const actor = await requireSession();
    const parsed = shipmentIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    const shipment = await markArrivedValencia(parsed.data.shipmentId);
    await logAudit({
      userId: actor.id,
      action: "MARK_SHIPMENT_ARRIVED_VALENCIA",
      entity: "ProviderShipment",
      entityId: shipment.id,
      payload: { arrivedValencia: shipment.arrivedValencia?.toISOString() },
    });
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
    const actor = await requireSession();
    const parsed = shipmentIdSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    const shipment = await markArrivedPlanta(parsed.data.shipmentId);
    await logAudit({
      userId: actor.id,
      action: "MARK_SHIPMENT_ARRIVED_PLANTA",
      entity: "ProviderShipment",
      entityId: shipment.id,
      payload: { arrivedPlanta: shipment.arrivedPlanta?.toISOString() },
    });
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: "Envío marcado como llegado a planta" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al actualizar el envío",
    };
  }
}
