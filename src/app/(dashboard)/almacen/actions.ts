"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { moveSack } from "@/lib/services/warehouse.service";

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
