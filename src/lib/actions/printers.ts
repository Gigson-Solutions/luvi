"use server";

import { requireUser } from "@/lib/rbac";
import {
  getPrinterChoice,
  type PrinterOption,
} from "@/lib/services/printer.service";

/**
 * Impresoras entre las que elegir al pulsar «Imprimir» y la que sale marcada.
 * Lo usa cualquier botón de impresión de etiquetas; imprimir sigue exigiendo
 * el permiso del módulo en la action que manda el trabajo.
 */
export async function getPrinterChoiceAction(): Promise<{
  printers: PrinterOption[];
  selectedId: string | null;
}> {
  const user = await requireUser();
  return getPrinterChoice(user.id);
}
