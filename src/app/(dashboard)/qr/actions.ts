"use server";

import { requireModule } from "@/lib/rbac";
import {
  findSackByQrOrId,
  printSackLabels,
  type PrintLabelsResult,
} from "@/lib/services/qr.service";
import { resolvePrinter } from "@/lib/services/printer.service";

/** Reimprime la etiqueta de una saca en la impresora elegida. */
export async function printSackLabelAction(
  sackId: string,
  printerId: string | null = null,
): Promise<PrintLabelsResult> {
  try {
    const actor = await requireModule("qr");
    const sack = await findSackByQrOrId(sackId);
    if (!sack) {
      return { ok: false, status: "error", message: "La saca no existe." };
    }
    return await printSackLabels(
      [sack],
      await resolvePrinter(actor.id, printerId ?? undefined),
    );
  } catch (e) {
    return {
      ok: false,
      status: "error",
      message:
        e instanceof Error ? e.message : "No se pudo imprimir la etiqueta",
    };
  }
}
