"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { moveSack, transferSacks } from "@/lib/services/warehouse.service";

export type ActionState = { ok: boolean; error?: string; message?: string };

async function requireSession(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("No autenticado");
}

const moveSchema = z.object({
  sackId: z.string().min(1),
  zoneId: z.string().min(1, "Selecciona una zona destino"),
});

/** Traslada una saca a otra zona, validando la capacidad de la zona destino. */
export async function moveSackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = moveSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    await moveSack(parsed.data);
    revalidatePath("/almacen");
    revalidatePath(`/almacen/${parsed.data.sackId}`);
    return { ok: true, message: "Saca trasladada" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al trasladar la saca",
    };
  }
}

const transferSchema = z.object({
  zoneId: z.string().min(1, "Selecciona una zona destino"),
  sackIds: z.array(z.string().min(1)).min(1, "Selecciona al menos una saca"),
});

/**
 * Traslada varias sacas a una zona destino. Si es entre plantas (La Gineta ↔
 * Montalbos) genera un albarán en Holded a nombre de la planta destino.
 */
export async function transferSacksAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = transferSchema.safeParse({
      zoneId: formData.get("zoneId"),
      sackIds: formData.getAll("sackIds"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const res = await transferSacks(parsed.data);
    revalidatePath("/almacen");

    let message = `${res.movedCount} saca(s) trasladada(s)`;
    if (res.interWarehouse && res.albaran) {
      if (res.albaran.generated) {
        message += res.albaran.simulated
          ? " · albarán Holded generado (simulado)"
          : ` · albarán Holded ${res.albaran.holdedId ?? "generado"}`;
      } else {
        message += ` · aviso: el albarán no se pudo generar (${res.albaran.error ?? "error Holded"})`;
      }
    }
    return { ok: true, message };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al trasladar las sacas",
    };
  }
}
