"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  registerContainer,
  weighContainer,
  confirmReception,
} from "@/lib/services/reception.service";
import { readWeight } from "@/lib/integrations/gestruck";

export type ActionState = { ok: boolean; error?: string; message?: string };

async function requireSession(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("No autenticado");
}

const registerSchema = z.object({
  reference: z.string().min(1, "La referencia es obligatoria"),
  supplierId: z.string().min(1, "Selecciona un proveedor"),
  materialId: z.string().optional(),
  warehouseId: z.string().optional(),
  billOfLading: z.string().optional(),
  expectedWeight: z.coerce.number().positive().optional(),
  numSacks: z.coerce.number().int().positive().optional(),
  numPallets: z.coerce.number().int().min(0).optional(),
  estimatedArrival: z.string().optional(),
  notes: z.string().optional(),
});

export async function registerContainerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = registerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { estimatedArrival, materialId, warehouseId, ...rest } = parsed.data;
    await registerContainer({
      ...rest,
      materialId: materialId || undefined,
      warehouseId: warehouseId || undefined,
      estimatedArrival: estimatedArrival
        ? new Date(estimatedArrival)
        : undefined,
    });
    revalidatePath("/recepciones");
    return { ok: true, message: "Contenedor registrado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al registrar",
    };
  }
}

/** Lee el peso de Gestruck (o indica manual). Se llama desde el cliente. */
export async function fetchGestruckWeightAction(
  vehicle: string,
): Promise<{ manual: boolean; weight?: number; reason?: string }> {
  await requireSession();
  const r = await readWeight({ vehicle });
  return { manual: r.manual, weight: r.weight, reason: r.reason };
}

const confirmSchema = z.object({
  containerId: z.string().min(1),
  actualWeight: z.coerce.number().positive("El peso debe ser mayor que 0"),
  weightSource: z.enum(["gestruck", "manual"]).default("manual"),
  scaleId: z.string().optional(),
  materialId: z.string().min(1, "Selecciona un material"),
  zoneId: z.string().min(1, "Selecciona un almacén destino"),
  numSacks: z.coerce.number().int().positive("Indica el nº de sacas"),
  numPallets: z.coerce.number().int().min(0).optional(),
});

/** Pesar + confirmar recepción + generar sacas, en un solo paso. */
export async function weighAndConfirmAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const parsed = confirmSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    await weighContainer({
      containerId: d.containerId,
      actualWeight: d.actualWeight,
      weightSource: d.weightSource,
      scaleId: d.scaleId,
    });
    const { sacksCreated } = await confirmReception({
      containerId: d.containerId,
      materialId: d.materialId,
      zoneId: d.zoneId,
      numSacks: d.numSacks,
      numPallets: d.numPallets,
    });
    revalidatePath("/recepciones");
    revalidatePath("/almacen");
    return {
      ok: true,
      message: `Recepción confirmada · ${sacksCreated} sacas generadas`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al confirmar",
    };
  }
}
