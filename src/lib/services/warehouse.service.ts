import { prisma } from "@/lib/prisma";
import { SackStatus, type Prisma } from "@prisma/client";
import { createAlbaran } from "@/lib/integrations/holded";

/**
 * Servicio de Almacén / Inventario — lógica de negocio sobre Zone + Sack.
 *
 * Cubre:
 *  1. Ocupación por zona (sacas EN_ALMACEN vs maxCapacity), agrupada por almacén,
 *     + ocupación proyectada por almacén y global (actual + sacas declaradas de
 *     contenedores pendientes según su almacén destino).
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
  /** Sacas declaradas en contenedores pendientes con este almacén como destino. */
  incomingSacks: number;
  /** Nº de contenedores pendientes con este almacén como destino. */
  pendingContainers: number;
  /** Ocupación proyectada del almacén = totalSacks + incomingSacks. */
  projectedSacks: number;
  /** % de ocupación actual sobre la capacidad del almacén (0–100, capado). */
  pctActual: number;
  /** % de ocupación proyectada sobre la capacidad del almacén (0–100, capado). */
  pctProjected: number;
}

export interface WarehouseStats {
  totalSacks: number;
  totalKg: number;
  zonesAtLimit: number;
  /** Capacidad global (suma de maxCapacity de todas las zonas activas). */
  totalCapacity: number;
  /**
   * Sacas declaradas en contenedores pendientes de recibir (aún sin pesar),
   * sumando todos los almacenes destino + los pendientes sin destino asignado.
   */
  incomingSacks: number;
  /** Nº de contenedores/camiones pendientes de recibir. */
  pendingContainers: number;
  /** Ocupación proyectada global = totalSacks + incomingSacks. */
  projectedSacks: number;
  /** % de ocupación actual sobre la capacidad global (0–100, capado). */
  pctActual: number;
  /** % de ocupación proyectada sobre la capacidad global (0–100, capado). */
  pctProjected: number;
  /** Sacas de contenedores pendientes que aún no tienen almacén destino. */
  unassignedIncoming: number;
  /** Nº de contenedores pendientes sin almacén destino asignado. */
  unassignedContainers: number;
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
  const [warehouses, grouped, pendingAgg] = await Promise.all([
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
    // Entrantes: contenedores pendientes de recibir (sin pesar todavía),
    // agrupados por su almacén destino declarado. Los que no tienen destino
    // asignado (warehouseId null) alimentan solo el total global.
    prisma.container.groupBy({
      by: ["warehouseId"],
      where: { actualWeight: null },
      _sum: { numSacks: true },
      _count: { _all: true },
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

  // Entrantes por almacén destino + bucket global de pendientes sin destino.
  const incomingByWarehouse = new Map<
    string,
    { sacks: number; containers: number }
  >();
  let incomingSacks = 0;
  let pendingContainers = 0;
  let unassignedIncoming = 0;
  let unassignedContainers = 0;
  for (const row of pendingAgg) {
    const sacks = row._sum.numSacks ?? 0;
    const containers = row._count._all;
    incomingSacks += sacks;
    pendingContainers += containers;
    if (row.warehouseId) {
      incomingByWarehouse.set(row.warehouseId, { sacks, containers });
    } else {
      unassignedIncoming += sacks;
      unassignedContainers += containers;
    }
  }

  const pct = (n: number, cap: number): number =>
    cap > 0 ? Math.min(100, Math.round((n / cap) * 100)) : 0;

  let totalSacks = 0;
  let totalKg = 0;
  let zonesAtLimit = 0;
  let totalCapacity = 0;

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
      totalCapacity += z.maxCapacity;
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

    const whIncoming = incomingByWarehouse.get(w.id) ?? {
      sacks: 0,
      containers: 0,
    };
    const whProjected = whSacks + whIncoming.sacks;

    return {
      id: w.id,
      name: w.name,
      code: w.code,
      location: w.location,
      zones,
      totalSacks: whSacks,
      totalCapacity: whCapacity,
      incomingSacks: whIncoming.sacks,
      pendingContainers: whIncoming.containers,
      projectedSacks: whProjected,
      pctActual: pct(whSacks, whCapacity),
      pctProjected: pct(whProjected, whCapacity),
    };
  });

  const projectedSacks = totalSacks + incomingSacks;

  return {
    warehouses: result,
    stats: {
      totalSacks,
      totalKg,
      zonesAtLimit,
      totalCapacity,
      incomingSacks,
      pendingContainers,
      projectedSacks,
      pctActual: pct(totalSacks, totalCapacity),
      pctProjected: pct(projectedSacks, totalCapacity),
      unassignedIncoming,
      unassignedContainers,
    },
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

// ─── 5. Traslado múltiple entre zonas (+ albarán si es entre plantas) ────────

export interface TransferSacksInput {
  sackIds: string[];
  zoneId: string;
}

export interface TransferResult {
  movedCount: number;
  /** El traslado cruza de una planta a otra (La Gineta ↔ Montalbos). */
  interWarehouse: boolean;
  albaran: {
    generated: boolean;
    simulated: boolean;
    holdedId?: string;
    error?: string;
  } | null;
}

/**
 * Traslada varias sacas a una zona destino. Si alguna procede de un almacén
 * distinto al destino (traslado entre plantas), genera UN albarán en Holded
 * con todas las sacas, a nombre de la planta destino. La báscula/Holded nunca
 * bloquea: si el albarán falla, el traslado igualmente se realiza.
 */
export async function transferSacks(
  input: TransferSacksInput,
): Promise<TransferResult> {
  if (input.sackIds.length === 0) {
    throw new Error("Selecciona al menos una saca.");
  }

  const [sacks, zone] = await Promise.all([
    prisma.sack.findMany({
      where: { id: { in: input.sackIds } },
      include: {
        material: { select: { name: true } },
        zone: { include: { warehouse: { select: { id: true, name: true } } } },
      },
    }),
    prisma.zone.findUniqueOrThrow({
      where: { id: input.zoneId },
      include: { warehouse: { select: { id: true, name: true } } },
    }),
  ]);

  if (sacks.length !== input.sackIds.length) {
    throw new Error("Alguna de las sacas seleccionadas no existe.");
  }

  const toMove = sacks.filter((s) => s.zoneId !== input.zoneId);
  if (toMove.length === 0) {
    throw new Error("Las sacas seleccionadas ya están en la zona destino.");
  }

  const occupied = await prisma.sack.count({
    where: { zoneId: input.zoneId, status: SackStatus.EN_ALMACEN },
  });
  if (occupied + toMove.length > zone.maxCapacity) {
    throw new Error(
      `La zona destino (${zone.name}) no tiene capacidad suficiente: ${occupied}/${zone.maxCapacity}, intentas añadir ${toMove.length}.`,
    );
  }

  await prisma.sack.updateMany({
    where: { id: { in: toMove.map((s) => s.id) } },
    data: { zoneId: input.zoneId },
  });

  // ¿El traslado cruza de planta? (origen ≠ almacén destino)
  const destWarehouseId = zone.warehouse.id;
  const sourceWarehouses = new Map<string, string>();
  for (const s of toMove) {
    const wh = s.zone?.warehouse;
    if (wh && wh.id !== destWarehouseId) sourceWarehouses.set(wh.id, wh.name);
  }
  const interWarehouse = sourceWarehouses.size > 0;

  let albaran: TransferResult["albaran"] = null;
  if (interWarehouse) {
    const sourceNames = Array.from(sourceWarehouses.values()).join(", ");
    const result = await createAlbaran({
      buyerName: zone.warehouse.name, // contacto = planta destino
      reference: `TRASLADO ${sourceNames} → ${zone.warehouse.name}`,
      notes: `Traslado interno de ${toMove.length} saca(s): ${sourceNames} → ${zone.warehouse.name}`,
      lines: toMove.map((s) => ({
        name: `${s.material.name} · ${s.qrCode}`,
        units: s.weight,
        price: 0,
      })),
    });
    albaran = {
      generated: result.ok,
      simulated: result.simulated,
      holdedId: result.holdedId,
      error: result.error,
    };
  }

  return { movedCount: toMove.length, interWarehouse, albaran };
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
