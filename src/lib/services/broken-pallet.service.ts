import { prisma } from "@/lib/prisma";
import { createAlbaran } from "@/lib/integrations/holded";
import type { Prisma } from "@prisma/client";

/**
 * Stock de palés rotos (Inventario).
 *
 *  - Entrada desde devoluciones: los palés marcados como rotos al registrar una
 *    devolución se suman aquí (ver `registerPalletReturn`).
 *  - Entrada manual: se añaden unidades a mano.
 *  - Salida: a un destinatario, descuenta del stock y genera el albarán en
 *    Holded. Nunca se pueden enviar más palés rotos de los disponibles.
 *
 * El disponible es la suma de los movimientos. Las escrituras que dependen del
 * stock se serializan con un advisory lock de Postgres para que dos salidas a
 * la vez no puedan dejarlo en negativo.
 */

export const BROKEN_PALLET_SOURCES = {
  DEVOLUCION: "devolución",
  MANUAL: "manual",
  SALIDA: "salida",
} as const;

/** Clave del advisory lock que serializa los movimientos de palés rotos. */
const BROKEN_PALLET_LOCK = 7_042_001;

/** Holded puede tardar hasta 8 s; la transacción espera a su respuesta. */
const SHIP_TX_TIMEOUT_MS = 20_000;

async function lockBrokenPallets(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRawUnsafe(
    `SELECT pg_advisory_xact_lock(${BROKEN_PALLET_LOCK})::text AS locked`,
  );
}

function assertPositiveInt(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("La cantidad debe ser un número entero mayor que 0.");
  }
  return quantity;
}

/** Palés rotos disponibles ahora mismo. */
export async function getBrokenPalletStock(
  client: Prisma.TransactionClient = prisma,
): Promise<number> {
  const agg = await client.brokenPalletMovement.aggregate({
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

export interface BrokenPalletsFromReturnInput {
  buyerId: string;
  quantity: number;
  vehiclePlate?: string;
  notes?: string;
  date?: Date;
}

/**
 * Suma al stock los palés rotos de una devolución. Se llama dentro de la
 * transacción de la devolución para que ambas cosas queden o no queden juntas.
 */
export async function addBrokenPalletsFromReturn(
  tx: Prisma.TransactionClient,
  input: BrokenPalletsFromReturnInput,
): Promise<void> {
  const quantity = assertPositiveInt(input.quantity);
  await lockBrokenPallets(tx);
  await tx.brokenPalletMovement.create({
    data: {
      quantity,
      source: BROKEN_PALLET_SOURCES.DEVOLUCION,
      buyerId: input.buyerId,
      vehiclePlate: input.vehiclePlate ?? null,
      notes: input.notes ?? null,
      ...(input.date ? { createdAt: input.date } : {}),
    },
  });
}

export interface AddBrokenPalletsInput {
  quantity: number;
  notes?: string;
}

/** Entrada manual de palés rotos. Devuelve el stock resultante. */
export async function addBrokenPallets(
  input: AddBrokenPalletsInput,
): Promise<number> {
  const quantity = assertPositiveInt(input.quantity);
  return prisma.$transaction(async (tx) => {
    await lockBrokenPallets(tx);
    await tx.brokenPalletMovement.create({
      data: {
        quantity,
        source: BROKEN_PALLET_SOURCES.MANUAL,
        notes: input.notes ?? null,
      },
    });
    return getBrokenPalletStock(tx);
  });
}

/** Referencia autogenerada de salida tipo PR-YYMMDD-NNN (secuencial diario). */
async function nextShipReference(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `PR-${yy}${mm}${dd}`;
  const count = await tx.brokenPalletMovement.count({
    where: { reference: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

export interface ShipBrokenPalletsInput {
  buyerId: string;
  quantity: number;
  notes?: string;
}

export interface ShipBrokenPalletsResult {
  reference: string;
  holdedAlbaranId: string | null;
  /** true si Holded no está configurado y el albarán es simulado. */
  simulated: boolean;
  /** Stock que queda tras la salida. */
  stock: number;
}

/**
 * Salida de palés rotos hacia un destinatario: comprueba el disponible,
 * genera el albarán en Holded y descuenta las unidades. Si Holded falla no se
 * descuenta nada.
 */
export async function shipBrokenPallets(
  input: ShipBrokenPalletsInput,
): Promise<ShipBrokenPalletsResult> {
  const quantity = assertPositiveInt(input.quantity);

  return prisma.$transaction(
    async (tx) => {
      await lockBrokenPallets(tx);

      const available = await getBrokenPalletStock(tx);
      if (quantity > available) {
        throw new Error(
          `No hay suficientes palés rotos: disponibles ${available}, intentas enviar ${quantity}.`,
        );
      }

      const buyer = await tx.buyer.findUnique({ where: { id: input.buyerId } });
      if (!buyer) throw new Error("El destinatario no existe.");

      const reference = await nextShipReference(tx);
      const albaran = await createAlbaran({
        contactHoldedId: buyer.holdedId,
        buyerName: buyer.name,
        reference,
        lines: [{ name: "Palés rotos", units: quantity }],
        notes: input.notes ?? reference,
      });
      if (!albaran.ok) {
        throw new Error(
          `No se pudo generar el albarán en Holded: ${albaran.error ?? "error"}`,
        );
      }

      // Persistir el contacto Holded en el comprador si se creó al vuelo.
      if (!buyer.holdedId && albaran.contactId) {
        await tx.buyer.update({
          where: { id: buyer.id },
          data: { holdedId: albaran.contactId },
        });
      }

      await tx.brokenPalletMovement.create({
        data: {
          quantity: -quantity,
          source: BROKEN_PALLET_SOURCES.SALIDA,
          buyerId: buyer.id,
          reference,
          holdedAlbaranId: albaran.holdedId ?? null,
          notes: input.notes ?? null,
        },
      });

      return {
        reference,
        holdedAlbaranId: albaran.holdedId ?? null,
        simulated: albaran.simulated,
        stock: available - quantity,
      };
    },
    { timeout: SHIP_TX_TIMEOUT_MS },
  );
}

export type BrokenPalletMovementWithBuyer =
  Prisma.BrokenPalletMovementGetPayload<{
    include: { buyer: { select: { id: true; name: true } } };
  }>;

/** Histórico de movimientos de palés rotos, más recientes primero. */
export function listBrokenPalletMovements(
  limit = 100,
): Promise<BrokenPalletMovementWithBuyer[]> {
  return prisma.brokenPalletMovement.findMany({
    include: { buyer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Destinatarios posibles de una salida: compradores activos. */
export function listBrokenPalletRecipients(): Promise<
  { id: string; name: string }[]
> {
  return prisma.buyer.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
