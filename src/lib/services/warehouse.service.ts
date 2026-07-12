import { prisma } from "@/lib/prisma";
import { SackStatus, type Prisma } from "@prisma/client";

/**
 * Servicio de Almacén / Inventario — lógica de negocio sobre Zone + Sack.
 *
 * Cubre:
 *  1. Ocupación por zona (sacas EN_ALMACEN vs maxCapacity), agrupada por almacén.
 *  2. Listado de sacas con filtros (estado, material, zona).
 *  3. Detalle de una saca con su ciclo de vida.
 *  4. Traslado de sacas entre zonas (validando capacidad de la zona destino).
 *
 * Criterio de ocupación: una zona "contiene" las sacas cuyo status es
 * EN_ALMACEN y están ubicadas en ella. El resto de estados (en producción,
 * expedidas, baja…) no ocupan hueco físico aunque conserven su zoneId.
 */

// ─── Tipos expuestos ────────────────────────────────────────────────────────

export interface ZoneOccupancy {
  id: string;
  name: string;
  code: string;
  maxCapacity: number;
  sackCount: number;
  weightKg: number;
  /** Porcentaje de ocupación (0–100, capado). */
  pct: number;
  /** true si la zona está a su capacidad máxima o por encima. */
  atLimit: boolean;
}

export interface WarehouseOccupancy {
  id: string;
  name: string;
  code: string;
  location: string | null;
  zones: ZoneOccupancy[];
  totalSacks: number;
  totalCapacity: number;
}

export interface WarehouseStats {
  totalSacks: number;
  totalKg: number;
  zonesAtLimit: number;
}

export interface WarehouseOverview {
  warehouses: WarehouseOccupancy[];
  stats: WarehouseStats;
}

export type SackWithRefs = Prisma.SackGetPayload<{
  include: {
    material: true;
    zone: { include: { warehouse: true } };
    container: true;
    lot: true;
  };
}>;

export type SackDetail = Prisma.SackGetPayload<{
  include: {
    material: true;
    zone: { include: { warehouse: true } };
    container: { include: { supplier: true } };
    lot: { include: { material: true } };
  };
}>;

// ─── 1. Ocupación por zona ──────────────────────────────────────────────────

/** Ocupación de todas las zonas agrupada por almacén + totales globales. */
export async function getWarehouseOverview(): Promise<WarehouseOverview> {
  const [warehouses, grouped] = await Promise.all([
    prisma.warehouse.findMany({
      where: { active: true },
      include: { zones: { orderBy: { code: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.sack.groupBy({
      by: ["zoneId"],
      where: { status: SackStatus.EN_ALMACEN, zoneId: { not: null } },
      _count: { _all: true },
      _sum: { weight: true },
    }),
  ]);

  const countByZone = new Map<string, { sacks: number; weight: number }>();
  for (const row of grouped) {
    if (row.zoneId) {
      countByZone.set(row.zoneId, {
        sacks: row._count._all,
        weight: row._sum.weight ?? 0,
      });
    }
  }

  let totalSacks = 0;
  let totalKg = 0;
  let zonesAtLimit = 0;

  const result: WarehouseOccupancy[] = warehouses.map((w) => {
    let whSacks = 0;
    let whCapacity = 0;

    const zones: ZoneOccupancy[] = w.zones.map((z) => {
      const agg = countByZone.get(z.id) ?? { sacks: 0, weight: 0 };
      const pct =
        z.maxCapacity > 0
          ? Math.min(100, Math.round((agg.sacks / z.maxCapacity) * 100))
          : 0;
      const atLimit = z.maxCapacity > 0 && agg.sacks >= z.maxCapacity;

      whSacks += agg.sacks;
      whCapacity += z.maxCapacity;
      totalSacks += agg.sacks;
      totalKg += agg.weight;
      if (atLimit) zonesAtLimit += 1;

      return {
        id: z.id,
        name: z.name,
        code: z.code,
        maxCapacity: z.maxCapacity,
        sackCount: agg.sacks,
        weightKg: agg.weight,
        pct,
        atLimit,
      };
    });

    return {
      id: w.id,
      name: w.name,
      code: w.code,
      location: w.location,
      zones,
      totalSacks: whSacks,
      totalCapacity: whCapacity,
    };
  });

  return {
    warehouses: result,
    stats: { totalSacks, totalKg, zonesAtLimit },
  };
}

// ─── 2. Listado de sacas con filtros ────────────────────────────────────────

export interface SackFilters {
  status?: SackStatus;
  materialId?: string;
  zoneId?: string;
}

/** Lista de sacas aplicando los filtros opcionales. */
export function listSacks(
  filters: SackFilters = {},
  limit = 200,
): Promise<SackWithRefs[]> {
  const where: Prisma.SackWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.materialId) where.materialId = filters.materialId;
  if (filters.zoneId) where.zoneId = filters.zoneId;

  return prisma.sack.findMany({
    where,
    include: {
      material: true,
      zone: { include: { warehouse: true } },
      container: true,
      lot: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ─── 3. Detalle de una saca ─────────────────────────────────────────────────

/** Detalle completo de una saca (ciclo de vida). Devuelve null si no existe. */
export function getSackDetail(sackId: string): Promise<SackDetail | null> {
  return prisma.sack.findUnique({
    where: { id: sackId },
    include: {
      material: true,
      zone: { include: { warehouse: true } },
      container: { include: { supplier: true } },
      lot: { include: { material: true } },
    },
  });
}

// ─── 4. Traslado de sacas entre zonas ───────────────────────────────────────

export interface MoveSackInput {
  sackId: string;
  zoneId: string;
}

/**
 * Traslada una saca a otra zona validando la capacidad de la zona destino.
 * Solo cuentan las sacas EN_ALMACEN para el aforo.
 */
export async function moveSack(input: MoveSackInput): Promise<SackWithRefs> {
  const [sack, zone] = await Promise.all([
    prisma.sack.findUniqueOrThrow({ where: { id: input.sackId } }),
    prisma.zone.findUniqueOrThrow({ where: { id: input.zoneId } }),
  ]);

  if (sack.zoneId === input.zoneId) {
    throw new Error("La saca ya está ubicada en esa zona.");
  }

  const occupied = await prisma.sack.count({
    where: { zoneId: input.zoneId, status: SackStatus.EN_ALMACEN },
  });
  if (occupied >= zone.maxCapacity) {
    throw new Error(
      `La zona destino (${zone.name}) está a su capacidad máxima (${occupied}/${zone.maxCapacity}).`,
    );
  }

  await prisma.sack.update({
    where: { id: input.sackId },
    data: { zoneId: input.zoneId },
  });

  return prisma.sack.findUniqueOrThrow({
    where: { id: input.sackId },
    include: {
      material: true,
      zone: { include: { warehouse: true } },
      container: true,
      lot: true,
    },
  });
}

// ─── Datos auxiliares para filtros / formularios ────────────────────────────

export function getWarehouseFilterData(): Promise<{
  materials: { id: string; name: string; code: string }[];
  zones: { id: string; name: string; code: string; warehouseName: string }[];
}> {
  return Promise.all([
    prisma.material.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.zone.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        warehouse: { select: { name: true } },
      },
      orderBy: { code: "asc" },
    }),
  ]).then(([materials, zones]) => ({
    materials,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      code: z.code,
      warehouseName: z.warehouse.name,
    })),
  }));
}
