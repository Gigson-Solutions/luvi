import { prisma } from "@/lib/prisma";
import type { Printer } from "@prisma/client";
import type { PrinterTarget } from "@/lib/integrations/qr-printer";

/**
 * Impresoras de etiquetas (Zebra) dadas de alta en Configuración.
 *
 * Todas son del mismo modelo y marca, así que solo cambia por dónde se llega a
 * cada una: su puente en el PC de planta y su IP en la LAN. Al imprimir, el
 * usuario elige en cuál y se le recuerda la última. Sin ninguna dada de alta
 * se sigue imprimiendo con la configuración de entorno (respaldo).
 */

export function listPrinters(): Promise<Printer[]> {
  return prisma.printer.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export interface PrinterInput {
  name: string;
  bridgePort: number;
  ip: string;
}

/** Dos impresoras activas en el mismo puente serían la misma Zebra. */
async function assertPortFree(
  bridgePort: number,
  exceptId?: string,
): Promise<void> {
  const clash = await prisma.printer.findFirst({
    where: {
      bridgePort,
      active: true,
      id: exceptId ? { not: exceptId } : undefined,
    },
    select: { name: true },
  });
  if (clash) {
    throw new Error(`El puerto ${bridgePort} ya lo usa «${clash.name}»`);
  }
}

export async function createPrinter(
  input: PrinterInput,
): Promise<{ id: string }> {
  await assertPortFree(input.bridgePort);
  return prisma.printer.create({ data: input, select: { id: true } });
}

export async function updatePrinter(
  id: string,
  input: PrinterInput,
): Promise<{ id: string }> {
  const current = await prisma.printer.findUniqueOrThrow({
    where: { id },
    select: { active: true },
  });
  if (current.active) await assertPortFree(input.bridgePort, id);
  return prisma.printer.update({
    where: { id },
    data: input,
    select: { id: true },
  });
}

export async function setPrinterActive(
  id: string,
  active: boolean,
): Promise<{ id: string }> {
  if (active) {
    const { bridgePort } = await prisma.printer.findUniqueOrThrow({
      where: { id },
      select: { bridgePort: true },
    });
    await assertPortFree(bridgePort, id);
  }
  return prisma.printer.update({
    where: { id },
    data: { active },
    select: { id: true },
  });
}

export interface PrinterOption {
  id: string;
  name: string;
}

/**
 * Impresoras entre las que elegir al imprimir y la que sale marcada: la última
 * que usó el usuario si sigue activa, o la primera.
 */
export async function getPrinterChoice(userId: string): Promise<{
  printers: PrinterOption[];
  selectedId: string | null;
}> {
  const [printers, user] = await Promise.all([
    prisma.printer.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { lastPrinterId: true },
    }),
  ]);
  const last = printers.find((p) => p.id === user?.lastPrinterId);
  return { printers, selectedId: (last ?? printers[0])?.id ?? null };
}

/**
 * Impresora en la que imprime un trabajo. Con `printerId` es esa (y queda
 * como la última del usuario); sin él, la que saldría marcada. Devuelve
 * `undefined` si no hay ninguna dada de alta: se imprime con el respaldo.
 */
export async function resolvePrinter(
  userId: string,
  printerId?: string,
): Promise<PrinterTarget | undefined> {
  if (!printerId) {
    const { selectedId } = await getPrinterChoice(userId);
    if (!selectedId) return undefined;
    printerId = selectedId;
  }
  const printer = await prisma.printer.findFirst({
    where: { id: printerId, active: true },
    select: { name: true, bridgePort: true, ip: true },
  });
  if (!printer) {
    throw new Error("La impresora elegida ya no está disponible");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { lastPrinterId: printerId },
    select: { id: true },
  });
  return printer;
}
