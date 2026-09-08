"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  setPurchaseOrderStatus,
  createProviderShipment,
  updateProviderShipment,
  setShipmentStage,
  markArrivedValencia,
  markArrivedPlanta,
} from "@/lib/services/procurement.service";
import { PurchaseOrderStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("aprovisionamiento");
}

/** Importe opcional del formulario: "" → undefined, y nunca negativo. */
const optionalAmount = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().nonnegative("El importe no puede ser negativo").optional(),
);

// ─── Crear orden de compra ──────────────────────────────────────────────────────
const orderFieldsSchema = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor"),
  materialId: z.string().optional(),
  orderedTons: z.coerce
    .number()
    .positive("Las toneladas deben ser mayores que 0"),
  originPort: z.string().optional(),
  totalPrice: optionalAmount,
  // Costes del pedido (T6), cada uno en su unidad.
  pricePerTon: optionalAmount,
  oceanFreightPerContainer: optionalAmount,
  arrivalCostsPerContainer: optionalAmount,
  arrivalCostsPerShipment: optionalAmount,
  deliveryTransportPerContainer: optionalAmount,
  additionalCostsPerShipment: optionalAmount,
  customsDuties: optionalAmount,
  notes: z.string().optional(),
});

const createOrderSchema = orderFieldsSchema;

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

// ─── Editar orden de compra (T6: costes editables tras guardar) ──────────────────
const updateOrderSchema = orderFieldsSchema.extend({
  id: z.string().min(1),
});

export async function updatePurchaseOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = updateOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { materialId, originPort, ...rest } = parsed.data;
    const order = await updatePurchaseOrder({
      ...rest,
      materialId: materialId || undefined,
      originPort: originPort || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "UPDATE_PURCHASE_ORDER",
      entity: "PurchaseOrder",
      entityId: order.id,
      payload: { poNumber: order.poNumber },
    });
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: `Pedido ${order.poNumber} actualizado` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al editar el pedido",
    };
  }
}

// ─── Corregir el estado del pedido (T4) ─────────────────────────────────────────
const orderStatusSchema = z.object({
  id: z.string().min(1),
  // "AUTO" devuelve el pedido al estado calculado a partir de sus envíos.
  status: z.union([z.nativeEnum(PurchaseOrderStatus), z.literal("AUTO")]),
});

export async function setPurchaseOrderStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = orderStatusSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Estado inválido" };
    const { id, status } = parsed.data;
    const result =
      status === "AUTO"
        ? await setPurchaseOrderStatus(id, PurchaseOrderStatus.ABIERTA, true)
        : await setPurchaseOrderStatus(id, status);
    await logAudit({
      userId: actor.id,
      action: "SET_PURCHASE_ORDER_STATUS",
      entity: "PurchaseOrder",
      entityId: id,
      payload: { status: result.status, manual: status !== "AUTO" },
    });
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: "Estado del pedido actualizado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al cambiar el estado",
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

// ─── Editar envío (T3) ────────────────────────────────────────────────────────────
const updateShipmentContainerSchema = shipmentContainerSchema.extend({
  id: z.string().optional(),
});

const updateShipmentSchema = z.object({
  id: z.string().min(1, "Envío inválido"),
  departureDate: z.string().optional(),
  etaValencia: z
    .string()
    .min(1, "La fecha de llegada a Valencia es obligatoria"),
  etaPlanta: z.string().min(1, "La fecha de llegada a planta es obligatoria"),
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
      const result = z
        .array(updateShipmentContainerSchema)
        .min(1)
        .safeParse(value);
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

export async function updateShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = updateShipmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { departureDate, etaValencia, etaPlanta, ...rest } = parsed.data;
    const shipment = await updateProviderShipment({
      ...rest,
      departureDate: departureDate ? new Date(departureDate) : undefined,
      etaValencia: new Date(etaValencia),
      etaPlanta: new Date(etaPlanta),
    });
    await logAudit({
      userId: actor.id,
      action: "UPDATE_PROVIDER_SHIPMENT",
      entity: "ProviderShipment",
      entityId: shipment.id,
      payload: { containers: shipment.containers.length },
    });
    revalidatePath("/aprovisionamiento");
    revalidatePath("/recepciones");
    return { ok: true, message: "Envío actualizado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al editar el envío",
    };
  }
}

// ─── Hitos de tránsito ────────────────────────────────────────────────────────────
const shipmentIdSchema = z.object({ shipmentId: z.string().min(1) });

const shipmentStageSchema = z.object({
  shipmentId: z.string().min(1),
  stage: z.enum(["MARITIMO", "VALENCIA", "PLANTA"]),
});

/** Corrige la etapa de un envío hacia delante o hacia atrás (T4). */
export async function setShipmentStageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = shipmentStageSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Etapa inválida" };
    const shipment = await setShipmentStage(
      parsed.data.shipmentId,
      parsed.data.stage,
    );
    await logAudit({
      userId: actor.id,
      action: "SET_SHIPMENT_STAGE",
      entity: "ProviderShipment",
      entityId: shipment.id,
      payload: { stage: parsed.data.stage },
    });
    revalidatePath("/aprovisionamiento");
    return { ok: true, message: "Etapa del envío actualizada" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al cambiar la etapa",
    };
  }
}

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
