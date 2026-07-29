import { prisma } from "@/lib/prisma";
import {
  SackStatus,
  ShipmentStatus,
  LotType,
  QualityResult,
  IncidentStatus,
} from "@prisma/client";
import { listLowStockConsumables } from "@/lib/services/consumable.service";

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

// ─── Panel Principal ────────────────────────────────────────────────────────────

export interface PanelStats {
  /** Contenedores/camiones registrados hoy → /recepciones. */
  trucksToday: number;
  /** Sacas pendientes de recibir/pesar (PENDIENTE_RECIBIR) → /recepciones. */
  pendingWeighing: number;
  /** Sacas en almacén (EN_ALMACEN) → /almacen. */
  sacksInStock: number;
  /** Incidencias no resueltas ni cerradas → /incidencias. */
  openIncidents: number;
  /** Envíos en BORRADOR/CONFIRMADO (aún no expedidos) → /expediciones. */
  pendingShipments: number;
  /** Consumibles por debajo de su umbral mínimo → /consumibles. */
  consumableAlerts: number;
}

/** KPIs de cabecera del Panel Principal (6 tarjetas clicables). */
export async function getPanelStats(): Promise<PanelStats> {
  const todayStart = startOfDay(new Date());

  const [
    trucksToday,
    pendingWeighing,
    sacksInStock,
    openIncidents,
    pendingShipments,
    lowStock,
  ] = await Promise.all([
    prisma.container.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.sack.count({ where: { status: SackStatus.PENDIENTE_RECIBIR } }),
    prisma.sack.count({ where: { status: SackStatus.EN_ALMACEN } }),
    prisma.incident.count({
      where: {
        status: {
          in: [
            IncidentStatus.ABIERTA,
            IncidentStatus.EN_REVISION,
            IncidentStatus.EN_PROCESO,
          ],
        },
      },
    }),
    prisma.shipment.count({
      where: {
        status: {
          in: [ShipmentStatus.BORRADOR, ShipmentStatus.CONFIRMADO],
        },
      },
    }),
    // Reutiliza la lógica de alertas de consumable.service (compara stock<mín).
    listLowStockConsumables(),
  ]);

  return {
    trucksToday,
    pendingWeighing,
    sacksInStock,
    openIncidents,
    pendingShipments,
    consumableAlerts: lowStock.length,
  };
}

// ─── Rentabilidad ───────────────────────────────────────────────────────────────

export interface ProviderProfitability {
  name: string;
  /** €/tonelada medio de compra de este proveedor en el periodo. */
  avgCostPerTon: number;
  /** Toneladas aprovisionadas en el periodo. */
  totalQuantity: number;
  /** Inversión total (€) en el periodo. */
  totalInvested: number;
  /** Nº de envíos de proveedor con precio en el periodo. */
  shipments: number;
}

export interface Profitability {
  /** Inversión total en compras con precio dentro del periodo (€). */
  totalInvested: number;
  /** Nº de envíos de proveedor con precio en el periodo. */
  shipmentsCount: number;
  /** Toneladas aprovisionadas con precio en el periodo. */
  totalQuantityTons: number;
  /** €/tonelada medio ponderado de compra. */
  avgCostPerTon: number;
  /** Coste total imputado a los lotes producidos en el periodo (€). */
  totalLotCost: number;
  /** Nº de lotes producidos en el periodo. */
  lotsCount: number;
  /** Coste medio por lote (€). */
  avgLotCost: number;
  /** Coste medio por kg de salida de los lotes del periodo (€/kg). */
  avgCostPerKg: number;
  /** Ranking de proveedores más rentables (menor €/t primero). */
  byProvider: ProviderProfitability[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * KPIs de rentabilidad de los últimos `days` días.
 *
 * Inversión / €·t: se derivan de los envíos de proveedor (Aprovisionamiento)
 * cuyo `PurchaseOrder.pricePerTon` es conocido, creados dentro del periodo.
 *   inversión_envío = (weightKg / 1000) · pricePerTon
 * Coste de lotes: coste de compra de la MP consumida por los lotes producidos
 * en el periodo (misma cadena que cost.service: Sack entrada → Container →
 * ProviderShipment → PurchaseOrder.pricePerTon).
 *
 * Si no hay datos calculables, devuelve ceros y `byProvider: []`.
 */
export async function getProfitability(days: number): Promise<Profitability> {
  const now = new Date();
  const from = startOfDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)),
  );
  const period = { gte: from, lte: endOfDay(now) };

  const [providerShipments, lots] = await Promise.all([
    // Compras (Aprovisionamiento) del periodo con precio de compra conocido.
    // TODO: si se prefiere la fecha de llegada a planta, filtrar por arrivedPlanta.
    prisma.providerShipment.findMany({
      where: {
        createdAt: period,
        weightKg: { not: null },
        purchaseOrder: { pricePerTon: { not: null } },
      },
      select: {
        weightKg: true,
        purchaseOrder: {
          select: {
            pricePerTon: true,
            supplier: { select: { name: true } },
          },
        },
      },
    }),
    // Lotes producidos en el periodo con la MP de entrada consumida y su precio.
    prisma.productionLot.findMany({
      where: { producedAt: period },
      select: {
        sacks: { select: { weight: true } },
        transformations: {
          select: {
            inputs: {
              select: {
                sack: {
                  select: {
                    weight: true,
                    container: {
                      select: {
                        providerShipment: {
                          select: {
                            purchaseOrder: { select: { pricePerTon: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  // Agregados de compras (inversión, toneladas) globales y por proveedor.
  let totalInvested = 0;
  let totalTons = 0;
  const byProviderMap = new Map<
    string,
    { invested: number; tons: number; shipments: number }
  >();

  for (const ps of providerShipments) {
    const ppt = ps.purchaseOrder?.pricePerTon;
    const kg = ps.weightKg;
    if (ppt == null || kg == null) continue;
    const tons = kg / 1000;
    const invested = tons * ppt;
    totalInvested += invested;
    totalTons += tons;

    const name = ps.purchaseOrder?.supplier?.name ?? "Sin proveedor";
    const row = byProviderMap.get(name) ?? {
      invested: 0,
      tons: 0,
      shipments: 0,
    };
    row.invested += invested;
    row.tons += tons;
    row.shipments += 1;
    byProviderMap.set(name, row);
  }

  const byProvider: ProviderProfitability[] = Array.from(
    byProviderMap.entries(),
  )
    .map(([name, v]) => ({
      name,
      avgCostPerTon: v.tons > 0 ? round2(v.invested / v.tons) : 0,
      totalQuantity: round2(v.tons),
      totalInvested: round2(v.invested),
      shipments: v.shipments,
    }))
    // Más rentable = menor coste de compra por tonelada.
    .sort((a, b) => a.avgCostPerTon - b.avgCostPerTon);

  // Coste de lotes producidos en el periodo (MP consumida).
  let totalLotCost = 0;
  let totalOutputKg = 0;
  for (const lot of lots) {
    for (const t of lot.transformations) {
      for (const inp of t.inputs) {
        const ppt =
          inp.sack.container?.providerShipment?.purchaseOrder?.pricePerTon ??
          null;
        if (ppt != null) totalLotCost += (inp.sack.weight / 1000) * ppt;
      }
    }
    totalOutputKg += lot.sacks.reduce((acc, s) => acc + s.weight, 0);
  }

  const lotsCount = lots.length;

  return {
    totalInvested: round2(totalInvested),
    shipmentsCount: providerShipments.length,
    totalQuantityTons: round2(totalTons),
    avgCostPerTon: totalTons > 0 ? round2(totalInvested / totalTons) : 0,
    totalLotCost: round2(totalLotCost),
    lotsCount,
    avgLotCost: lotsCount > 0 ? round2(totalLotCost / lotsCount) : 0,
    avgCostPerKg:
      totalOutputKg > 0
        ? Math.round((totalLotCost / totalOutputKg) * 1000) / 1000
        : 0,
    byProvider,
  };
}
