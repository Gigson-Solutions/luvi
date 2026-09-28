import { prisma } from "@/lib/prisma";
import { SackStatus, StockAdjustmentType, type Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * Altas y bajas manuales de inventario de sacas.
 *
 * - **Alta:** crea N sacas EN_ALMACEN de un producto, con el mismo peso cada
 *   una, en la ubicación indicada (no hay sacas sin ubicar). Cada saca lleva su
 *   QR y las notas del alta ("stock inicial", BLs…), que salen en la etiqueta.
 * - **Baja:** pasa a BAJA N sacas EN_ALMACEN del producto, las más antiguas
 *   primero, opcionalmente solo de una ubicación.
 *
 * Cada movimiento queda registrado en `StockAdjustment` y las sacas enlazadas a
 * él, así se puede ver de dónde salió una saca y reimprimir las etiquetas.
 */

/** Tope por movimiento, para no generar miles de sacas por un error de tecleo. */
export const MAX_SACKS_PER_ADJUSTMENT = 1000;

export type StockAdjustmentRow = Prisma.StockAdjustmentGetPayload<{
  include: {
    material: { select: { name: true; code: true } };
    zone: { select: { name: true; warehouse: { select: { name: true } } } };
    user: { select: { name: true } };
  };
}>;

export interface StockEntryInput {
  materialId: string;
  zoneId: string;
  numSacks: number;
  weightPerSack: number;
  date: Date;
  notes?: string;
  userId?: string;
}

function assertSackCount(numSacks: number): void {
  if (!Number.isInteger(numSacks) || numSacks < 1) {
    throw new Error("El número de sacas debe ser al menos 1.");
  }
  if (numSacks > MAX_SACKS_PER_ADJUSTMENT) {
    throw new Error(
      `Como máximo ${MAX_SACKS_PER_ADJUSTMENT} sacas por movimiento.`,
    );
  }
}

/** Alta manual: crea las sacas en almacén y devuelve el movimiento. */
export async function createStockEntry(
  input: StockEntryInput,
): Promise<{ id: string; numSacks: number; totalWeight: number }> {
  assertSackCount(input.numSacks);
  if (!(input.weightPerSack > 0)) {
    throw new Error("El peso por saca debe ser mayor que 0.");
  }
  const weightPerSack = Math.round(input.weightPerSack * 100) / 100;
  const totalWeight = Math.round(weightPerSack * input.numSacks * 100) / 100;
  const notes = input.notes?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.stockAdjustment.create({
      data: {
        type: StockAdjustmentType.ALTA,
        materialId: input.materialId,
        zoneId: input.zoneId,
        numSacks: input.numSacks,
        weightPerSack,
        totalWeight,
        date: input.date,
        notes,
        userId: input.userId ?? null,
      },
    });
    await tx.sack.createMany({
      data: Array.from({ length: input.numSacks }, (_, i) => ({
        qrCode: `SACK-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: SackStatus.EN_ALMACEN,
        weight: weightPerSack,
        materialId: input.materialId,
        zoneId: input.zoneId,
        stockEntryId: adjustment.id,
        batchNumber: `${i + 1}/${input.numSacks}`,
        notes,
      })),
    });
    return { id: adjustment.id, numSacks: input.numSacks, totalWeight };
  });
}

export interface StockExitInput {
  materialId: string;
  /** Solo sacas de esta ubicación; sin ella, de cualquiera. */
  zoneId?: string;
  numSacks: number;
  date: Date;
  notes?: string;
  userId?: string;
}

/** Baja manual: pasa a BAJA las N sacas en almacén más antiguas del producto. */
export async function createStockExit(
  input: StockExitInput,
): Promise<{ id: string; numSacks: number; totalWeight: number }> {
  assertSackCount(input.numSacks);
  const notes = input.notes?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const sacks = await tx.sack.findMany({
      where: {
        materialId: input.materialId,
        status: SackStatus.EN_ALMACEN,
        ...(input.zoneId ? { zoneId: input.zoneId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: input.numSacks,
      select: { id: true, weight: true },
    });
    if (sacks.length < input.numSacks) {
      throw new Error(
        `Solo hay ${sacks.length} sacas en almacén de ese producto${
          input.zoneId ? " en esa ubicación" : ""
        }.`,
      );
    }
    const totalWeight =
      Math.round(sacks.reduce((sum, s) => sum + s.weight, 0) * 100) / 100;

    const adjustment = await tx.stockAdjustment.create({
      data: {
        type: StockAdjustmentType.BAJA,
        materialId: input.materialId,
        zoneId: input.zoneId ?? null,
        numSacks: input.numSacks,
        totalWeight,
        date: input.date,
        notes,
        userId: input.userId ?? null,
      },
    });
    const { count } = await tx.sack.updateMany({
      where: {
        id: { in: sacks.map((s) => s.id) },
        status: SackStatus.EN_ALMACEN,
      },
      data: { status: SackStatus.BAJA, stockExitId: adjustment.id },
    });
    // Otra operación pudo mover alguna saca entre la lectura y la escritura.
    if (count !== input.numSacks) {
      throw new Error(
        "Alguna saca ha cambiado de estado mientras se daba de baja. Inténtalo de nuevo.",
      );
    }
    return { id: adjustment.id, numSacks: input.numSacks, totalWeight };
  });
}

/** Últimos movimientos manuales, más recientes primero. */
export function listStockAdjustments(
  limit = 100,
): Promise<StockAdjustmentRow[]> {
  return prisma.stockAdjustment.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      material: { select: { name: true, code: true } },
      zone: { select: { name: true, warehouse: { select: { name: true } } } },
      user: { select: { name: true } },
    },
  });
}

/** Sacas en almacén por producto y ubicación, para validar la baja en el formulario. */
export interface StockAvailability {
  materialId: string;
  zoneId: string | null;
  count: number;
}

export async function getSackAvailability(): Promise<StockAvailability[]> {
  const rows = await prisma.sack.groupBy({
    by: ["materialId", "zoneId"],
    where: { status: SackStatus.EN_ALMACEN },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    materialId: r.materialId,
    zoneId: r.zoneId,
    count: r._count._all,
  }));
}

/** Ubicaciones seleccionables ("Almacén · Zona"), de almacenes activos. */
export async function listZoneOptions(): Promise<
  { id: string; name: string }[]
> {
  const zones = await prisma.zone.findMany({
    where: { warehouse: { active: true } },
    select: { id: true, name: true, warehouse: { select: { name: true } } },
    orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }],
  });
  return zones.map((z) => ({
    id: z.id,
    name: `${z.warehouse.name} · ${z.name}`,
  }));
}
