"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createIncident,
  advanceIncidentStatus,
} from "@/lib/services/incident.service";

export type ActionState = { ok: boolean; error?: string; message?: string };

const createSchema = z.object({
  title: z.string().min(1, "El título es obligatorio"),
  description: z.string().optional(),
  warehouseId: z.string().optional(),
  sackQrCode: z.string().optional(),
  // TODO: subida a R2 pendiente — de momento se acepta una URL introducida a mano.
  photoUrl: z
    .string()
    .url("La foto debe ser una URL válida")
    .optional()
    .or(z.literal("")),
});

export async function createIncidentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireModule("incidencias");

    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { title, description, warehouseId, sackQrCode, photoUrl } =
      parsed.data;

    const incident = await createIncident({
      title,
      description: description || undefined,
      warehouseId: warehouseId || undefined,
      sackQrCode: sackQrCode || undefined,
      photoUrl: photoUrl || undefined,
      reportedById: actor.id,
    });

    // Traza de auditoría: alta de incidencia.
    await logAudit({
      userId: actor.id,
      action: "CREATE_INCIDENT",
      entity: "Incident",
      entityId: incident.id,
      payload: { title: incident.title, status: incident.status },
    });

    revalidatePath("/incidencias");
    return { ok: true, message: "Incidencia creada" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear la incidencia",
    };
  }
}

const advanceSchema = z.object({
  id: z.string().min(1),
});

/** Avanza la incidencia al siguiente estado del lifecycle. */
export async function advanceIncidentStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireModule("incidencias");

    const parsed = advanceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: "Incidencia inválida" };
    }

    const updated = await advanceIncidentStatus(parsed.data.id);

    // Traza de auditoría: cambio de estado de la incidencia.
    await logAudit({
      userId: actor.id,
      action: "ADVANCE_INCIDENT_STATUS",
      entity: "Incident",
      entityId: updated.id,
      payload: { status: updated.status },
    });

    revalidatePath("/incidencias");
    return { ok: true, message: `Estado actualizado a ${updated.status}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al actualizar el estado",
    };
  }
}
