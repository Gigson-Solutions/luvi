"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LotType } from "@prisma/client";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createShipment,
  confirmShipment,
  expediteShipment,
  deliverShipment,
  assignLotToShipment,
  unassignLotFromShipment,
  createManualLot,
  removeSackFromLot,
} from "@/lib/services/shipment.service";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

const INITIAL_ERROR = "Error al procesar la solicitud";

function requireSession(): Promise<CurrentUser> {
  return requireModule("expediciones");
}

// ─── Envíos ────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  buyerId: z.string().min(1, "Selecciona un comprador"),
  carrierId: z.string().optional(),
  vehiclePlate: z.string().optional(),
  driverName: z.string().optional(),
  notes: z.string().optional(),
});

/** GL-42 — crea el envío en BORRADOR (vacío). Los lotes se asignan después. */
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
    const { buyerId, carrierId, vehiclePlate, driverName, notes } = parsed.data;
    const shipment = await createShipment({
      buyerId,
      carrierId: carrierId || undefined,
      vehiclePlate: vehiclePlate || undefined,
      driverName: driverName || undefined,
      notes: notes || undefined,
    });
    revalidatePath("/expediciones");
    return { ok: true, message: `Envío ${shipment.reference} creado` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}

const idSchema = z.object({ shipmentId: z.string().min(1) });

const assignSchema = z.object({
  shipmentId: z.string().min(1),
  lotId: z.string().min(1),
});

/** GL-42 — asigna un lote a un envío en borrador. */
export async function assignLotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = assignSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Datos inválidos" };
    const shipment = await assignLotToShipment(
      parsed.data.shipmentId,
      parsed.data.lotId,
    );
    await logAudit({
      userId: actor.id,
      action: "ASSIGN_LOT",
      entity: "Shipment",
      entityId: shipment.id,
      payload: { reference: shipment.reference, lotId: parsed.data.lotId },
    });
    revalidatePath("/expediciones");
    return { ok: true, message: `Lote asignado a ${shipment.reference}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}

/** GL-42 — quita un lote de un envío en borrador. */
export async function unassignLotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = assignSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Datos inválidos" };
    await unassignLotFromShipment(parsed.data.shipmentId, parsed.data.lotId);
    revalidatePath("/expediciones");
    return { ok: true, message: "Lote retirado del envío" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}

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

const expediteSchema = z.object({
  shipmentId: z.string().min(1),
  returnablePallets: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  palletCount: z.coerce.number().int().nonnegative().optional(),
});

/** GL-42 — expide el envío (crea albarán Holded) + palés retornables. */
export async function expediteShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = expediteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Envío inválido" };
    const { shipment, simulated } = await expediteShipment(
      parsed.data.shipmentId,
      {
        returnablePallets: parsed.data.returnablePallets,
        palletCount: parsed.data.palletCount,
      },
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

// ─── Lotes (GL-41 crear manual · GL-39 modificar) ──────────────────────────────

const manualLotSchema = z.object({
  type: z.nativeEnum(LotType),
  sackIds: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sacas inválidas",
        });
        return z.NEVER;
      }
    })
    .pipe(z.array(z.string().min(1)).min(1, "Selecciona al menos una saca")),
});

/** GL-41 — crea un lote manual agrupando sacas sueltas (subproducto/rechazo). */
export async function createManualLotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = manualLotSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const lot = await createManualLot(parsed.data.type, parsed.data.sackIds);
    await logAudit({
      userId: actor.id,
      action: "CREATE_MANUAL_LOT",
      entity: "ProductionLot",
      entityId: lot.id,
      payload: { lotNumber: lot.lotNumber, sackCount: lot.sackCount },
    });
    revalidatePath("/expediciones");
    return {
      ok: true,
      message: `Lote ${lot.lotNumber} creado (${lot.sackCount} sacas)`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}

const removeSackSchema = z.object({ sackId: z.string().min(1) });

/** GL-39 — saca una saca de un lote no asignado (vuelve a estar suelta). */
export async function removeSackFromLotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = removeSackSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Saca inválida" };
    await removeSackFromLot(parsed.data.sackId);
    await logAudit({
      userId: actor.id,
      action: "REMOVE_SACK_FROM_LOT",
      entity: "Sack",
      entityId: parsed.data.sackId,
    });
    revalidatePath("/expediciones");
    return { ok: true, message: "Saca sacada del lote" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : INITIAL_ERROR };
  }
}
