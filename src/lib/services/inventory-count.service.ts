import { prisma } from "@/lib/prisma";
import { SackStatus, type Prisma } from "@prisma/client";

/**
 * Servicio de recuento de inventario por escaneo de sacas.
 *
 * El operario abre una sesión (opcionalmente de un solo almacén), va escaneando
 * los QR de las sacas y al finalizar la app compara lo escaneado con el stock
 * teórico —las sacas EN_ALMACEN de ese almacén— y guarda fecha y resultado.
 *
 * Reglas:
 *  - Solo puede haber una sesión abierta a la vez (evita recuentos cruzados).
 *  - Escanear dos veces la misma saca no suma: se avisa de que ya estaba.
 *  - Un QR que no está en el stock teórico se registra igual, marcado como
 *    "no esperada": es justo el tipo de descuadre que hay que ver.
 */

export interface InventoryCountSummary {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  warehouseId: string | null;
  warehouseName: string | null;
  userName: string | null;
  scannedCount: number | null;
  expectedCount: number | null;
  missingCount: number | null;
  unknownCount: number | null;
  /** Nº de escaneos registrados (incluye los no esperados). */
  scans: number;
}

export interface MissingSack {
  id: string;
  qrCode: string;
  materialName: string;
  zoneName: string | null;
  weight: number;
}

export interface ScannedSack {
  qrCode: string;
  scannedAt: Date;
  materialName: string | null;
  zoneName: string | null;
  /** El QR no estaba en el stock teórico de la sesión. */
  unexpected: boolean;
}

export interface OpenCountDetail {
  id: string;
  startedAt: Date;
  warehouseId: string | null;
  warehouseName: string | null;
  /** Sacas del stock teórico (EN_ALMACEN, del almacén de la sesión). */
  expectedCount: number;
  /** Escaneadas que estaban en el stock teórico. */
  scannedCount: number;
  /** Escaneos que no correspondían al stock teórico. */
  unknownCount: number;
  scans: ScannedSack[];
}

/** Sacas del stock teórico de una sesión (EN_ALMACEN del almacén indicado). */
function theoreticalSacksWhere(
  warehouseId: string | null,
): Prisma.SackWhereInput {
  return {
    status: SackStatus.EN_ALMACEN,
    ...(warehouseId ? { zone: { is: { warehouseId } } } : {}),
  };
}

/** Sesión abierta, si la hay. */
export function findOpenCount(): Promise<{ id: string } | null> {
  return prisma.inventoryCount.findFirst({
    where: { finishedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
}

/** Abre una sesión de inventario. Falla si ya hay otra abierta. */
export async function startInventoryCount(input: {
  warehouseId?: string;
  userId?: string;
  notes?: string;
}): Promise<{ id: string }> {
  const open = await findOpenCount();
  if (open) {
    throw new Error(
      "Ya hay un inventario abierto. Finalízalo antes de empezar otro.",
    );
  }
  return prisma.inventoryCount.create({
    data: {
      warehouseId: input.warehouseId ?? null,
      userId: input.userId ?? null,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });
}

export type ScanResult =
  | { status: "ok"; qrCode: string; materialName: string; zoneName: string | null }
  | { status: "duplicada"; qrCode: string }
  | { status: "no_esperada"; qrCode: string; reason: string };

/**
 * Registra un escaneo en la sesión abierta. Devuelve qué ha pasado para que la
 * pantalla avise: saca correcta, repetida o fuera del stock teórico.
 */
export async function scanSack(
  countId: string,
  rawQrCode: string,
): Promise<ScanResult> {
  const qrCode = rawQrCode.trim();
  if (!qrCode) throw new Error("Código vacío.");

  const count = await prisma.inventoryCount.findUniqueOrThrow({
    where: { id: countId },
    select: { finishedAt: true, warehouseId: true },
  });
  if (count.finishedAt) throw new Error("Este inventario ya está finalizado.");

  const already = await prisma.inventoryScan.findFirst({
    where: { countId, qrCode },
    select: { id: true },
  });
  if (already) return { status: "duplicada", qrCode };

  const sack = await prisma.sack.findUnique({
    where: { qrCode },
    select: {
      id: true,
      status: true,
      material: { select: { name: true } },
      zone: { select: { name: true, warehouseId: true } },
    },
  });

  const inTheoreticalStock =
    sack != null &&
    sack.status === SackStatus.EN_ALMACEN &&
    (count.warehouseId == null || sack.zone?.warehouseId === count.warehouseId);

  await prisma.inventoryScan.create({
    data: { countId, qrCode, sackId: sack?.id ?? null },
  });

  if (!inTheoreticalStock) {
    const reason =
      sack == null
        ? "No existe ninguna saca con ese código."
        : sack.status !== SackStatus.EN_ALMACEN
          ? `La saca no está en almacén (${sack.status}).`
          : "La saca es de otro almacén.";
    return { status: "no_esperada", qrCode, reason };
  }

  return {
    status: "ok",
    qrCode,
    materialName: sack.material.name,
    zoneName: sack.zone?.name ?? null,
  };
}

/** Estado en vivo de una sesión: teóricas, escaneadas y no esperadas. */
export async function getCountDetail(
  countId: string,
): Promise<OpenCountDetail | null> {
  const count = await prisma.inventoryCount.findUnique({
    where: { id: countId },
    include: {
      warehouse: { select: { name: true } },
      scans: {
        orderBy: { scannedAt: "desc" },
        include: {
          sack: {
            select: {
              status: true,
              material: { select: { name: true } },
              zone: { select: { name: true, warehouseId: true } },
            },
          },
        },
      },
    },
  });
  if (!count) return null;

  const expectedCount = await prisma.sack.count({
    where: theoreticalSacksWhere(count.warehouseId),
  });

  const scans: ScannedSack[] = count.scans.map((s) => {
    const inStock =
      s.sack != null &&
      s.sack.status === SackStatus.EN_ALMACEN &&
      (count.warehouseId == null ||
        s.sack.zone?.warehouseId === count.warehouseId);
    return {
      qrCode: s.qrCode,
      scannedAt: s.scannedAt,
      materialName: s.sack?.material.name ?? null,
      zoneName: s.sack?.zone?.name ?? null,
      unexpected: !inStock,
    };
  });

  return {
    id: count.id,
    startedAt: count.startedAt,
    warehouseId: count.warehouseId,
    warehouseName: count.warehouse?.name ?? null,
    expectedCount,
    scannedCount: scans.filter((s) => !s.unexpected).length,
    unknownCount: scans.filter((s) => s.unexpected).length,
    scans,
  };
}

export interface FinishCountResult {
  expectedCount: number;
  scannedCount: number;
  missingCount: number;
  unknownCount: number;
  missing: MissingSack[];
}

/**
 * Cierra la sesión: compara escaneado vs stock teórico, guarda el resultado y
 * congela qué sacas faltaron (el stock teórico cambia con el tiempo).
 */
export async function finishInventoryCount(
  countId: string,
): Promise<FinishCountResult> {
  const count = await prisma.inventoryCount.findUniqueOrThrow({
    where: { id: countId },
    select: { finishedAt: true, warehouseId: true },
  });
  if (count.finishedAt) throw new Error("Este inventario ya está finalizado.");

  const [expected, scans] = await Promise.all([
    prisma.sack.findMany({
      where: theoreticalSacksWhere(count.warehouseId),
      select: {
        id: true,
        qrCode: true,
        weight: true,
        material: { select: { name: true } },
        zone: { select: { name: true } },
      },
      orderBy: { qrCode: "asc" },
    }),
    prisma.inventoryScan.findMany({
      where: { countId },
      select: { qrCode: true },
    }),
  ]);

  const scannedCodes = new Set(scans.map((s) => s.qrCode));
  const missing: MissingSack[] = expected
    .filter((s) => !scannedCodes.has(s.qrCode))
    .map((s) => ({
      id: s.id,
      qrCode: s.qrCode,
      materialName: s.material.name,
      zoneName: s.zone?.name ?? null,
      weight: s.weight,
    }));

  const expectedCodes = new Set(expected.map((s) => s.qrCode));
  const scannedCount = scans.filter((s) => expectedCodes.has(s.qrCode)).length;
  const unknownCount = scans.length - scannedCount;

  await prisma.inventoryCount.update({
    where: { id: countId },
    data: {
      finishedAt: new Date(),
      expectedCount: expected.length,
      scannedCount,
      missingCount: missing.length,
      unknownCount,
      missingSackIds: missing.map((m) => m.qrCode),
    },
  });

  return {
    expectedCount: expected.length,
    scannedCount,
    missingCount: missing.length,
    unknownCount,
    missing,
  };
}

/** Histórico de recuentos, el más reciente primero. */
export async function listInventoryCounts(
  limit = 20,
): Promise<InventoryCountSummary[]> {
  const counts = await prisma.inventoryCount.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      warehouse: { select: { name: true } },
      user: { select: { name: true } },
      _count: { select: { scans: true } },
    },
  });
  return counts.map((c) => ({
    id: c.id,
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    warehouseId: c.warehouseId,
    warehouseName: c.warehouse?.name ?? null,
    userName: c.user?.name ?? null,
    scannedCount: c.scannedCount,
    expectedCount: c.expectedCount,
    missingCount: c.missingCount,
    unknownCount: c.unknownCount,
    scans: c._count.scans,
  }));
}

/** Sacas que faltaron en un recuento ya cerrado (por su QR congelado). */
export async function getMissingSacks(countId: string): Promise<MissingSack[]> {
  const count = await prisma.inventoryCount.findUnique({
    where: { id: countId },
    select: { missingSackIds: true },
  });
  const codes = Array.isArray(count?.missingSackIds)
    ? (count.missingSackIds as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  if (codes.length === 0) return [];

  const sacks = await prisma.sack.findMany({
    where: { qrCode: { in: codes } },
    select: {
      id: true,
      qrCode: true,
      weight: true,
      material: { select: { name: true } },
      zone: { select: { name: true } },
    },
    orderBy: { qrCode: "asc" },
  });
  return sacks.map((s) => ({
    id: s.id,
    qrCode: s.qrCode,
    materialName: s.material.name,
    zoneName: s.zone?.name ?? null,
    weight: s.weight,
  }));
}
