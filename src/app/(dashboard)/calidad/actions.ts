"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createRecord,
  saveRecord,
  deleteRecord,
} from "@/lib/services/quality.service";
import type { CurrentUser } from "@/lib/rbac";
import { SHIFTS } from "./quality-thresholds";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("calidad");
}

const shiftSchema = z.enum(SHIFTS).optional().or(z.literal(""));

// ─── Crear registro ──────────────────────────────────────────────────────────────

const createSchema = z.object({
  date: z.string().min(1, "Selecciona una fecha"),
  shift: shiftSchema,
  client: z.string().optional(),
  notes: z.string().optional(),
});

export async function createRecordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    const date = new Date(`${d.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: "Fecha inválida" };
    }

    const record = await createRecord({
      date,
      shift: d.shift || undefined,
      client: d.client?.trim() || undefined,
      notes: d.notes?.trim() || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "CREATE_QUALITY_RECORD",
      entity: "QualityRecord",
      entityId: record.id,
      payload: { date: d.date },
    });
    revalidatePath("/calidad");
    return { ok: true, message: "Registro creado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear el registro",
    };
  }
}

// ─── Guardar muestras ────────────────────────────────────────────────────────────

const nullableNumber = z.union([z.number(), z.null()]);

const sampleSchema = z.object({
  index: z.number().int().min(1).max(20),
  density: nullableNumber,
  pvc: nullableNumber,
  cola: nullableNumber,
  multicapas: nullableNumber,
  metal: nullableNumber,
  otros: nullableNumber,
  comment: z.string().nullable(),
});

const saveSchema = z.object({
  id: z.string().min(1),
  shift: shiftSchema,
  client: z.string().optional(),
  notes: z.string().optional(),
  samples: z.array(sampleSchema).max(20),
});

export async function saveRecordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const raw = {
      id: formData.get("id"),
      shift: formData.get("shift") ?? "",
      client: formData.get("client") ?? "",
      notes: formData.get("notes") ?? "",
      samples: JSON.parse(String(formData.get("samples") ?? "[]")),
    };
    const parsed = saveSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    await saveRecord({
      id: d.id,
      shift: d.shift || undefined,
      client: d.client?.trim() || undefined,
      notes: d.notes?.trim() || undefined,
      samples: d.samples,
    });
    await logAudit({
      userId: actor.id,
      action: "SAVE_QUALITY_SAMPLES",
      entity: "QualityRecord",
      entityId: d.id,
      payload: { samples: d.samples.length },
    });
    revalidatePath("/calidad");
    return { ok: true, message: "Muestras guardadas" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al guardar",
    };
  }
}

// ─── Eliminar registro ───────────────────────────────────────────────────────────

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteRecordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: "Registro inválido" };
    }
    await deleteRecord(parsed.data.id);
    await logAudit({
      userId: actor.id,
      action: "DELETE_QUALITY_RECORD",
      entity: "QualityRecord",
      entityId: parsed.data.id,
    });
    revalidatePath("/calidad");
    return { ok: true, message: "Registro eliminado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al eliminar",
    };
  }
}
