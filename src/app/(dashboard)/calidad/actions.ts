"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { QualityResult } from "@prisma/client";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createQualityRecord,
  updateQualityResult,
} from "@/lib/services/quality.service";
import type { CurrentUser } from "@/lib/rbac";
import { getOutOfRangeMeasures } from "./quality-thresholds";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("calidad");
}

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().optional(),
);

const createSchema = z.object({
  lotId: z.string().min(1, "Selecciona un lote"),
  materialId: z.string().min(1, "Selecciona un material"),
  supplierId: z.string().optional(),
  shift: z.enum(["M", "T", "N"]).optional().or(z.literal("")),
  sampleType: z.enum(["MP", "PT"]).optional().or(z.literal("")),
  result: z.nativeEnum(QualityResult),
  overrideReason: z.string().optional(),
  density: optionalNumber,
  pvcPct: optionalNumber,
  gluePct: optionalNumber,
  multilayerPct: optionalNumber,
  metalPct: optionalNumber,
  otherPct: optionalNumber,
  notes: z.string().optional(),
});

export async function createQualityRecordAction(
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

    const outOfRange = getOutOfRangeMeasures({
      density: d.density,
      pvcPct: d.pvcPct,
      gluePct: d.gluePct,
      multilayerPct: d.multilayerPct,
      metalPct: d.metalPct,
      otherPct: d.otherPct,
    });
    const overrideReason = d.overrideReason?.trim();
    if (
      d.result === QualityResult.OK &&
      outOfRange.length > 0 &&
      !overrideReason
    ) {
      return {
        ok: false,
        error:
          "Hay parámetros fuera de rango: indica un motivo para forzar el resultado OK.",
      };
    }

    const record = await createQualityRecord({
      lotId: d.lotId,
      materialId: d.materialId,
      supplierId: d.supplierId || undefined,
      shift: d.shift ? d.shift : undefined,
      sampleType: d.sampleType ? d.sampleType : undefined,
      result: d.result,
      overrideReason: overrideReason || undefined,
      density: d.density,
      pvcPct: d.pvcPct,
      gluePct: d.gluePct,
      multilayerPct: d.multilayerPct,
      metalPct: d.metalPct,
      otherPct: d.otherPct,
      notes: d.notes,
    });
    await logAudit({
      userId: actor.id,
      action: "CREATE_QUALITY_RECORD",
      entity: "QualityRecord",
      entityId: record.id,
      payload: { lotId: record.lotId, result: record.result },
    });
    revalidatePath("/calidad");
    return { ok: true, message: "Registro de calidad creado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear el registro",
    };
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  result: z.nativeEnum(QualityResult),
  overrideReason: z.string().optional(),
});

export async function updateQualityResultAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = updateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    const record = await updateQualityResult({
      id: d.id,
      result: d.result,
      overrideReason: d.overrideReason?.trim() || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "UPDATE_QUALITY_RESULT",
      entity: "QualityRecord",
      entityId: record.id,
      payload: { result: record.result },
    });
    revalidatePath("/calidad");
    return { ok: true, message: "Resultado actualizado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al actualizar",
    };
  }
}
