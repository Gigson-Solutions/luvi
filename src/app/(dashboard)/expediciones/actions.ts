"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createShipment,
  confirmShipment,
  expediteShipment,
  deliverShipment,
} from "@/lib/services/shipment.service";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

const INITIAL_ERROR = "Error al procesar la solicitud";

function requireSession(): Promise<CurrentUser> {
  return requireModule("expediciones");
}

const lotSchema = z.object({
  lotId: z.string().min(1),
  weightKg: z.coerce.number().positive(),
});

const createSchema = z.object({
  buyerId: z.string().min(1, "Selecciona un comprador"),
  carrierId: z.string().optional(),
  vehiclePlate: z.string().optional(),
  driverName: z.string().optional(),
  notes: z.string().optional(),
  returnablePallets: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  palletCount: z.coerce.number().int().nonnegative().optional(),
  lots: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Lotes inválidos",
        });
        return z.NEVER;
      }
    })
    .pipe(z.array(lotSchema).min(1, "Añade al menos un lote")),
});

export async function createShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const {
      buyerId,
      carrierId,
      vehiclePlate,
      driverName,
      notes,
      returnablePallets,
      palletCount,
      lots,
    } = parsed.data;
    const shipment = await createShipment({
      buyerId,
      carrierId: carrierId || undefined,
      vehiclePlate: vehiclePlate || undefined,
      driverName: driverName || undefined,
      notes: notes || undefined,
      returnablePallets,
      palletCount,
      lots,
    });
    revalidatePath("/expediciones");
    return { ok: true, message: `Envío ${shipment.reference} creado` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}

const idSchema = z.object({ shipmentId: z.string().min(1) });

export async function confirmShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = idSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    const shipment = await confirmShipment(parsed.data.shipmentId);
    await logAudit({
      userId: actor.id,
      action: "CONFIRM_SHIPMENT",
      entity: "Shipment",
      entityId: shipment.id,
      payload: { reference: shipment.reference },
    });
    revalidatePath("/expediciones");
    return { ok: true, message: `Envío ${shipment.reference} confirmado` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}

export async function expediteShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = idSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    const { shipment, simulated } = await expediteShipment(
      parsed.data.shipmentId,
    );
    await logAudit({
      userId: actor.id,
      action: "EXPEDITE_SHIPMENT",
      entity: "Shipment",
      entityId: shipment.id,
      payload: { reference: shipment.reference, simulated },
    });
    revalidatePath("/expediciones");
    revalidatePath("/almacen");
    const base = `Envío ${shipment.reference} expedido`;
    return {
      ok: true,
      message: simulated
        ? `${base} · albarán Holded SIMULADO (sin API key)`
        : `${base} · albarán generado en Holded`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}

export async function deliverShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = idSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    const shipment = await deliverShipment(parsed.data.shipmentId);
    await logAudit({
      userId: actor.id,
      action: "DELIVER_SHIPMENT",
      entity: "Shipment",
      entityId: shipment.id,
      payload: { reference: shipment.reference },
    });
    revalidatePath("/expediciones");
    revalidatePath("/almacen");
    return { ok: true, message: `Envío ${shipment.reference} entregado` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}
