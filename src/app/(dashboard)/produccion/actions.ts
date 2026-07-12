"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { LotType } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  enterHopper,
  createOutputSack,
  findWarehouseSackByQr,
  type SackWithMaterialZone,
} from "@/lib/services/production.service";

export type ActionState = { ok: boolean; error?: string; message?: string };

async function requireOperator(): Promise<string | undefined> {
  const session = await auth();
  if (!session) throw new Error("No autenticado");
  return session.user?.id;
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
    const operatorId = await requireOperator();
    const parsed = enterHopperSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { qrCode } = await enterHopper(parsed.data.sackId, operatorId);
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
    await requireOperator();
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
