import { prisma } from "@/lib/prisma";
import {
  SackStatus,
  ShipmentStatus,
  LotType,
  QualityResult,
} from "@prisma/client";

// ─── Rango de fechas reutilizable ──────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** "YYYY-MM-DD" local de un Date (para inputs y URLs). */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Resuelve el rango a partir de los searchParams `from`/`to` ("YYYY-MM-DD").
 * Por defecto: los últimos 30 días (incluido hoy hasta las 23:59:59).
 */
export function resolveRange(from?: string, to?: string): DateRange {
  const now = new Date();
  const toDate = to ? endOfDay(new Date(`${to}T00:00:00`)) : endOfDay(now);
  const fromDate = from
    ? startOfDay(new Date(`${from}T00:00:00`))
    : startOfDay(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29),
      );
  return { from: fromDate, to: toDate };
}

export interface WarehouseDash {
  totalSacks: number;
  totalKg: number;
  zonesAtLimit: number;
  byStatus: { status: SackStatus; count: number }[];
  zones: { name: string; warehouse: string; used: number; capacity: number }[];
}

export async function getWarehouseDashboard(): Promise<WarehouseDash> {
  const [sacksInStock, statusGroups, zones] = await Promise.all([
    prisma.sack.aggregate({
      where: { status: SackStatus.EN_ALMACEN },
      _count: true,
      _sum: { weight: true },
    }),
    prisma.sack.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.zone.findMany({
      select: {
        name: true,
        maxCapacity: true,
        warehouse: { select: { name: true } },
        _count: { select: { sacks: true } },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  const zoneRows = zones.map((z) => ({
    name: z.name,
    warehouse: z.warehouse.name,
    used: z._count.sacks,
    capacity: z.maxCapacity,
  }));

  return {
    totalSacks: sacksInStock._count,
    totalKg: sacksInStock._sum.weight ?? 0,
    zonesAtLimit: zoneRows.filter((z) => z.capacity > 0 && z.used >= z.capacity)
      .length,
    byStatus: statusGroups.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
    zones: zoneRows,
  };
}

export interface ProductionDash {
  lots: number;
  kgProduced: number;
  sacksInProduction: number;
  byType: { type: LotType; kg: number; sacks: number }[];
}

export async function getProductionDashboard(
  range: DateRange,
): Promise<ProductionDash> {
  const period = { gte: range.from, lte: range.to };
  const [lots, inProduction, outputByType] = await Promise.all([
    prisma.productionLot.count({
      where: { producedAt: period },
    }),
    prisma.sack.count({ where: { status: SackStatus.EN_PRODUCCION } }),
    prisma.sack.groupBy({
      by: ["status"],
      where: {
        status: {
          in: [
            SackStatus.PRODUCTO_TERMINADO,
            SackStatus.SUBPRODUCTO,
            SackStatus.RECHAZO,
          ],
        },
        createdAt: period,
      },
      _count: { _all: true },
      _sum: { weight: true },
    }),
  ]);

  const mapType: Record<string, LotType> = {
    PRODUCTO_TERMINADO: LotType.PRODUCTO_TERMINADO,
    SUBPRODUCTO: LotType.SUBPRODUCTO,
    RECHAZO: LotType.RECHAZO,
  };

  const byType = outputByType.map((g) => ({
    type: mapType[g.status] ?? LotType.PRODUCTO_TERMINADO,
    kg: g._sum.weight ?? 0,
    sacks: g._count._all,
  }));

  return {
    lots,
    kgProduced: byType.reduce((acc, t) => acc + t.kg, 0),
    sacksInProduction: inProduction,
    byType,
  };
}

export interface LogisticsDash {
  byStatus: { status: ShipmentStatus; count: number }[];
  kgExpedited: number;
  shipments: number;
}

export async function getLogisticsDashboard(
  range: DateRange,
): Promise<LogisticsDash> {
  const period = { gte: range.from, lte: range.to };
  const [statusGroups, expedited, shipments] = await Promise.all([
    prisma.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.shipmentLot.aggregate({
      where: { shipment: { expeditedAt: period } },
      _sum: { weightKg: true },
      _count: true,
    }),
    prisma.shipment.count({
      where: { expeditedAt: period },
    }),
  ]);

  return {
    byStatus: statusGroups.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
    kgExpedited: expedited._sum.weightKg ?? 0,
    shipments,
  };
}

export interface QualityDash {
  total: number;
  ok: number;
  nok: number;
  pending: number;
  rejectRate: number; // %
}

export async function getQualityDashboard(
  range: DateRange,
): Promise<QualityDash> {
  const groups = await prisma.qualityRecord.groupBy({
    by: ["result"],
    where: { recordedAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
  });
  const count = (r: QualityResult): number =>
    groups.find((g) => g.result === r)?._count._all ?? 0;
  const ok = count(QualityResult.OK);
  const nok = count(QualityResult.NOK);
  const pending = count(QualityResult.PENDIENTE);
  const total = ok + nok + pending;
  return {
    total,
    ok,
    nok,
    pending,
    rejectRate: ok + nok > 0 ? Math.round((nok / (ok + nok)) * 1000) / 10 : 0,
  };
}

export interface ProcurementDash {
  openOrders: number;
  tonsInTransit: number;
  shipmentsInTransit: number;
}

export async function getProcurementDashboard(): Promise<ProcurementDash> {
  const [openOrders, inTransit] = await Promise.all([
    prisma.purchaseOrder.count({
      where: { status: { in: ["ABIERTA", "EN_TRANSITO"] } },
    }),
    prisma.providerShipment.aggregate({
      where: { arrivedPlanta: null },
      _sum: { weightKg: true },
      _count: true,
    }),
  ]);
  return {
    openOrders,
    tonsInTransit:
      Math.round(((inTransit._sum.weightKg ?? 0) / 1000) * 100) / 100,
    shipmentsInTransit: inTransit._count,
  };
}
