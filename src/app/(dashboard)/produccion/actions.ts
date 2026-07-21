"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LotType } from "@prisma/client";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  enterHopper,
  createOutputSack,
  findWarehouseSackByQr,
  type SackWithMaterialZone,
} from "@/lib/services/production.service";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

/** Exige acceso al módulo de producción y devuelve el usuario actual (actor). */
function requireOperator(): Promise<CurrentUser> {
  return requireModule("produccion");
}

const enterHopperSchema = z.object({
  sackId: z.string().min(1, "Selecciona una saca"),
});

/** Confirma la entrada a tolva de una saca (→ EN_PRODUCCION). */
export async function enterHopperAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireOperator();
    const parsed = enterHopperSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { qrCode } = await enterHopper(parsed.data.sackId, actor.id);
    await logAudit({
      userId: actor.id,
      action: "ENTER_HOPPER",
      entity: "Sack",
      entityId: parsed.data.sackId,
      payload: { qrCode },
    });
    revalidatePath("/produccion");
    revalidatePath("/almacen");
    return { ok: true, message: `Saca ${qrCode} en tolva` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al entrar a tolva",
    };
  }
}

/** Busca una saca EN_ALMACEN por su QR (para el escáner). */
export async function findSackByQrAction(
  qrCode: string,
): Promise<{ ok: boolean; sack?: SackWithMaterialZone; error?: string }> {
  try {
    await requireOperator();
    const sack = await findWarehouseSackByQr(qrCode.trim());
    if (!sack) {
      return {
        ok: false,
        error: "No se encontró ninguna saca en almacén con ese QR.",
      };
    }
    return { ok: true, sack };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al buscar la saca",
    };
  }
}

const outputSchema = z.object({
  type: z.nativeEnum(LotType),
  materialId: z.string().min(1, "Selecciona un material"),
  weight: z.coerce.number().positive("El peso debe ser mayor que 0"),
  zoneId: z.string().optional(),
  notes: z.string().optional(),
});

/** Crea una saca de salida (PT / Subproducto / Rechazo) en el lote del día. */
export async function createOutputSackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireOperator();
    const parsed = outputSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    const { qrCode, lotNumber } = await createOutputSack({
      type: d.type,
      materialId: d.materialId,
      weight: d.weight,
      zoneId: d.zoneId || undefined,
      notes: d.notes || undefined,
    });
    // El servicio solo devuelve { qrCode, lotNumber }: sin id de saca, se
    // deja entityId sin poner y se guardan qrCode/lotNumber/tipo en el payload.
    await logAudit({
      userId: actor.id,
      action: "CREATE_OUTPUT_SACK",
      entity: "Sack",
      payload: { lotNumber, qrCode, type: d.type },
    });
    revalidatePath("/produccion");
    revalidatePath("/almacen");
    return { ok: true, message: `Saca ${qrCode} · lote ${lotNumber}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear la saca",
    };
  }
}
