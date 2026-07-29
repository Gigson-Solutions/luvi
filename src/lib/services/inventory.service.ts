import { prisma } from "@/lib/prisma";
import { SackStatus, ConsumableType } from "@prisma/client";

/**
 * Servicio de Inventario (analítica) — agrega datos de Sack, ProductionLot,
 * Transformation, ProviderShipment/PurchaseOrder y Consumable para la página
 * `/inventario`. Es puramente de LECTURA: no muta nada.
 *
 * Concepto clave — "proveedor de material": la saca de entrada procede de un
 * Container, y el Container tiene un Supplier. Ese proveedor (container.supplier)
 * es el "proveedor de material" que se usa para desglosar producción, consumo,
 * ubicación y stock esperado. Las sacas de salida (PT/Sub/Rechazo) no tienen
 * container; su proveedor de origen se aproxima trazando el lote hasta las sacas
 * de entrada que lo alimentaron (ver getLotOriginSuppliers).
 */

const SIN_PROVEEDOR = "Sin proveedor";

const OUTPUT_STATUSES: SackStatus[] = [
  SackStatus.PRODUCTO_TERMINADO,
  SackStatus.SUBPRODUCTO,
  SackStatus.RECHAZO,
];

type OutputKey = "pt" | "subproducto" | "rechazo";

function outputKey(status: SackStatus): OutputKey | null {
  if (status === SackStatus.PRODUCTO_TERMINADO) return "pt";
  if (status === SackStatus.SUBPRODUCTO) return "subproducto";
  if (status === SackStatus.RECHAZO) return "rechazo";
  return null;
}

// ─── Semanas (últimas N, lunes a lunes) ─────────────────────────────────────────

export interface Week {
  label: string;
  range: string;
  isCurrent: boolean;
}

interface WeekBucket extends Week {
  start: Date;
  end: Date;
}

function ddmm(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1,
  ).padStart(2, "0")}`;
}

/** Últimas `n` semanas (lunes 00:00 → lunes siguiente), la más antigua primero. */
function lastNWeeks(n: number): WeekBucket[] {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  // getDay(): 0=Dom..6=Sáb → días transcurridos desde el lunes.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const weeks: WeekBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);
    weeks.push({
      start,
      end,
      label: i === 0 ? "Esta semana" : `Hace ${i} sem`,
      range: `${ddmm(start)} – ${ddmm(lastDay)}`,
      isCurrent: i === 0,
    });
  }
  return weeks;
}

function weekIndexOf(
  weeks: WeekBucket[],
  date: Date | null | undefined,
): number {
  if (!date) return -1;
  const t = date.getTime();
  return weeks.findIndex((w) => t >= w.start.getTime() && t < w.end.getTime());
}

// ─── 1. Producción ──────────────────────────────────────────────────────────────

export interface TypeStat {
  count: number;
  weightKg: number;
}

export interface ProviderStat {
  provider: string;
  count: number;
  weightKg: number;
}

export interface ProductionWeek extends Week {
  pt: number;
  subproducto: number;
  rechazo: number;
  total: number;
  weightKg: number;
  byProvider: { provider: string; count: number }[];
}

export interface ProductionStats {
  pt: TypeStat;
  subproducto: TypeStat;
  rechazo: TypeStat;
  byProvider: Record<OutputKey, ProviderStat[]>;
  weekly: ProductionWeek[];
}

/**
 * Proveedor de origen "dominante" de cada lote: se trazan las sacas de entrada
 * de sus transformaciones hasta el proveedor de su contenedor y se toma el más
 * frecuente. Aproximación: un lote puede mezclar proveedores; nos quedamos con
 * el mayoritario.
 */
async function getLotOriginSuppliers(): Promise<Map<string, string>> {
  const inputs = await prisma.transformationInput.findMany({
    select: {
      transformation: { select: { lotId: true } },
      sack: {
        select: {
          container: { select: { supplier: { select: { name: true } } } },
        },
      },
    },
  });

  const tally = new Map<string, Map<string, number>>();
  for (const i of inputs) {
    const lotId = i.transformation.lotId;
    const provider = i.sack.container?.supplier.name ?? SIN_PROVEEDOR;
    const perLot = tally.get(lotId) ?? new Map<string, number>();
    perLot.set(provider, (perLot.get(provider) ?? 0) + 1);
    tally.set(lotId, perLot);
  }

  const dominant = new Map<string, string>();
  for (const [lotId, perLot] of tally) {
    const top = [...perLot.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) dominant.set(lotId, top[0]);
  }
  return dominant;
}

/** Tarjetas por tipo, desglose por proveedor de origen e histórico semanal. */
export async function getProductionStats(): Promise<ProductionStats> {
  const weeks = lastNWeeks(5);
  const [sacks, originByLot] = await Promise.all([
    prisma.sack.findMany({
      where: { status: { in: OUTPUT_STATUSES } },
      select: {
        status: true,
        weight: true,
        lotId: true,
        lot: { select: { producedAt: true } },
      },
    }),
    getLotOriginSuppliers(),
  ]);

  const totals: Record<OutputKey, TypeStat> = {
    pt: { count: 0, weightKg: 0 },
    subproducto: { count: 0, weightKg: 0 },
    rechazo: { count: 0, weightKg: 0 },
  };
  const providerAcc: Record<OutputKey, Map<string, ProviderStat>> = {
    pt: new Map(),
    subproducto: new Map(),
    rechazo: new Map(),
  };
  const weekAcc = weeks.map((w): ProductionWeek => ({
    label: w.label,
    range: w.range,
    isCurrent: w.isCurrent,
    pt: 0,
    subproducto: 0,
    rechazo: 0,
    total: 0,
    weightKg: 0,
    byProvider: [],
  }));
  const weekProviderTally = weeks.map(() => new Map<string, number>());

  for (const s of sacks) {
    const key = outputKey(s.status);
    if (!key) continue;
    const provider = s.lotId
      ? (originByLot.get(s.lotId) ?? SIN_PROVEEDOR)
      : SIN_PROVEEDOR;

    totals[key].count += 1;
    totals[key].weightKg += s.weight;

    const acc = providerAcc[key];
    const cur = acc.get(provider) ?? { provider, count: 0, weightKg: 0 };
    cur.count += 1;
    cur.weightKg += s.weight;
    acc.set(provider, cur);

    const wi = weekIndexOf(weeks, s.lot?.producedAt);
    if (wi >= 0) {
      weekAcc[wi][key] += 1;
      weekAcc[wi].total += 1;
      weekAcc[wi].weightKg += s.weight;
      const tally = weekProviderTally[wi];
      tally.set(provider, (tally.get(provider) ?? 0) + 1);
    }
  }

  weekAcc.forEach((w, i) => {
    w.byProvider = [...weekProviderTally[i].entries()]
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);
  });

  const sortProviders = (m: Map<string, ProviderStat>): ProviderStat[] =>
    [...m.values()].sort((a, b) => b.count - a.count);

  return {
    pt: totals.pt,
    subproducto: totals.subproducto,
    rechazo: totals.rechazo,
    byProvider: {
      pt: sortProviders(providerAcc.pt),
      subproducto: sortProviders(providerAcc.subproducto),
      rechazo: sortProviders(providerAcc.rechazo),
    },
    weekly: weekAcc,
  };
}

// ─── 2. Consumido ─────────────────────────────────────────────────────────────

export interface ConsumedWeek extends Week {
  count: number;
  weightKg: number;
  byProvider: { provider: string; count: number }[];
}

export interface ConsumptionStats {
  byProvider: ProviderStat[];
  weekly: ConsumedWeek[];
}

/**
 * Sacas consumidas (entradas a tolva registradas en TransformationInput),
 * desglosadas por proveedor de material + histórico semanal por enteredAt.
 */
export async function getConsumptionStats(): Promise<ConsumptionStats> {
  const weeks = lastNWeeks(5);
  const inputs = await prisma.transformationInput.findMany({
    select: {
      enteredAt: true,
      sack: {
        select: {
          weight: true,
          container: { select: { supplier: { select: { name: true } } } },
        },
      },
    },
  });

  const providerAcc = new Map<string, ProviderStat>();
  const weekAcc = weeks.map((w): ConsumedWeek => ({
    label: w.label,
    range: w.range,
    isCurrent: w.isCurrent,
    count: 0,
    weightKg: 0,
    byProvider: [],
  }));
  const weekProviderTally = weeks.map(() => new Map<string, number>());

  for (const i of inputs) {
    const provider = i.sack.container?.supplier.name ?? SIN_PROVEEDOR;
    const weight = i.sack.weight;

    const cur = providerAcc.get(provider) ?? {
      provider,
      count: 0,
      weightKg: 0,
    };
    cur.count += 1;
    cur.weightKg += weight;
    providerAcc.set(provider, cur);

    const wi = weekIndexOf(weeks, i.enteredAt);
    if (wi >= 0) {
      weekAcc[wi].count += 1;
      weekAcc[wi].weightKg += weight;
      const tally = weekProviderTally[wi];
      tally.set(provider, (tally.get(provider) ?? 0) + 1);
    }
  }

  weekAcc.forEach((w, i) => {
    w.byProvider = [...weekProviderTally[i].entries()]
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);
  });

  return {
    byProvider: [...providerAcc.values()].sort((a, b) => b.count - a.count),
    weekly: weekAcc,
  };
}

// ─── 3. Ubicación ─────────────────────────────────────────────────────────────

export interface ProviderLocation {
  provider: string;
  totalCount: number;
  totalWeightKg: number;
  warehouses: { warehouse: string; count: number; weightKg: number }[];
}

/**
 * Sacas EN_ALMACEN agrupadas por proveedor de material y, dentro de cada uno,
 * por almacén (nombre de la planta: Montalbos / La Gineta).
 */
export async function getLocationStats(): Promise<ProviderLocation[]> {
  const sacks = await prisma.sack.findMany({
    where: { status: SackStatus.EN_ALMACEN },
    select: {
      weight: true,
      container: { select: { supplier: { select: { name: true } } } },
      zone: { select: { warehouse: { select: { name: true } } } },
    },
  });

  const byProvider = new Map<
    string,
    {
      totalCount: number;
      totalWeightKg: number;
      warehouses: Map<string, { count: number; weightKg: number }>;
    }
  >();

  for (const s of sacks) {
    const provider = s.container?.supplier.name ?? SIN_PROVEEDOR;
    const warehouse = s.zone?.warehouse.name ?? "Sin ubicar";
    const entry = byProvider.get(provider) ?? {
      totalCount: 0,
      totalWeightKg: 0,
      warehouses: new Map(),
    };
    entry.totalCount += 1;
    entry.totalWeightKg += s.weight;
    const wh = entry.warehouses.get(warehouse) ?? { count: 0, weightKg: 0 };
    wh.count += 1;
    wh.weightKg += s.weight;
    entry.warehouses.set(warehouse, wh);
    byProvider.set(provider, entry);
  }

  return [...byProvider.entries()]
    .map(([provider, e]) => ({
      provider,
      totalCount: e.totalCount,
      totalWeightKg: e.totalWeightKg,
      warehouses: [...e.warehouses.entries()]
        .map(([warehouse, w]) => ({
          warehouse,
          count: w.count,
          weightKg: w.weightKg,
        }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.totalCount - a.totalCount);
}

// ─── 4. Esperado ──────────────────────────────────────────────────────────────

export interface ExpectedProvider {
  provider: string;
  currentCount: number;
  currentWeightKg: number;
  transitCount: number;
  transitWeightKg: number;
  purchasedCount: number;
  purchasedWeightKg: number;
  totalCount: number;
  totalWeightKg: number;
}

export interface ExpectedStock {
  totals: {
    currentCount: number;
    currentWeightKg: number;
    transitCount: number;
    transitWeightKg: number;
    purchasedCount: number;
    purchasedWeightKg: number;
    totalCount: number;
    totalWeightKg: number;
  };
  byProvider: ExpectedProvider[];
}

// TODO: aproximación 1 saca ≈ 1 t para tránsito/comprado (solo tenemos peso/tons,
// no nº de sacas real hasta que el envío se recibe y se generan las sacas).
function tonsToSacks(tons: number): number {
  return Math.round(tons);
}

/**
 * Stock esperado por proveedor de material:
 *  - Actual: sacas EN_ALMACEN (peso real).
 *  - Tránsito: envíos de proveedor aún no llegados a planta (weightKg).
 *  - Comprado (no enviado): toneladas pedidas en POs abiertas pendientes de enviar.
 * Conecta con Aprovisionamiento. 1 saca ≈ 1 t donde hace falta aproximar.
 */
export async function getExpectedStock(): Promise<ExpectedStock> {
  const [current, orders] = await Promise.all([
    prisma.sack.findMany({
      where: { status: SackStatus.EN_ALMACEN },
      select: {
        weight: true,
        container: { select: { supplier: { select: { name: true } } } },
      },
    }),
    prisma.purchaseOrder.findMany({
      select: {
        orderedTons: true,
        supplier: { select: { name: true } },
        providerShipments: { select: { weightKg: true, arrivedPlanta: true } },
      },
    }),
  ]);

  const acc = new Map<string, ExpectedProvider>();
  const get = (provider: string): ExpectedProvider => {
    const e = acc.get(provider) ?? {
      provider,
      currentCount: 0,
      currentWeightKg: 0,
      transitCount: 0,
      transitWeightKg: 0,
      purchasedCount: 0,
      purchasedWeightKg: 0,
      totalCount: 0,
      totalWeightKg: 0,
    };
    acc.set(provider, e);
    return e;
  };

  for (const s of current) {
    const e = get(s.container?.supplier.name ?? SIN_PROVEEDOR);
    e.currentCount += 1;
    e.currentWeightKg += s.weight;
  }

  for (const o of orders) {
    const e = get(o.supplier.name);
    const sentKg = o.providerShipments.reduce(
      (a, s) => a + (s.weightKg ?? 0),
      0,
    );
    const transitKg = o.providerShipments.reduce(
      (a, s) => a + (s.arrivedPlanta ? 0 : (s.weightKg ?? 0)),
      0,
    );
    e.transitWeightKg += transitKg;
    e.transitCount += tonsToSacks(transitKg / 1000);

    const pendingToShipTons = Math.max(0, o.orderedTons - sentKg / 1000);
    e.purchasedWeightKg += pendingToShipTons * 1000;
    e.purchasedCount += tonsToSacks(pendingToShipTons);
  }

  const byProvider = [...acc.values()].map((e) => ({
    ...e,
    totalCount: e.currentCount + e.transitCount + e.purchasedCount,
    totalWeightKg: e.currentWeightKg + e.transitWeightKg + e.purchasedWeightKg,
  }));
  byProvider.sort((a, b) => b.totalCount - a.totalCount);

  const totals = byProvider.reduce(
    (t, e) => ({
      currentCount: t.currentCount + e.currentCount,
      currentWeightKg: t.currentWeightKg + e.currentWeightKg,
      transitCount: t.transitCount + e.transitCount,
      transitWeightKg: t.transitWeightKg + e.transitWeightKg,
      purchasedCount: t.purchasedCount + e.purchasedCount,
      purchasedWeightKg: t.purchasedWeightKg + e.purchasedWeightKg,
      totalCount: t.totalCount + e.totalCount,
      totalWeightKg: t.totalWeightKg + e.totalWeightKg,
    }),
    {
      currentCount: 0,
      currentWeightKg: 0,
      transitCount: 0,
      transitWeightKg: 0,
      purchasedCount: 0,
      purchasedWeightKg: 0,
      totalCount: 0,
      totalWeightKg: 0,
    },
  );

  return { totals, byProvider };
}

// ─── 5. Consumibles ───────────────────────────────────────────────────────────

export interface ConsumableStockLine {
  current: number;
  minimum: number;
}

export interface ConsumablesWeek extends Week {
  pales: number;
  capuchones: number;
  sacas: number;
}

export interface ConsumablesStats {
  stock: {
    pales: ConsumableStockLine;
    capuchones: ConsumableStockLine;
    sacas: ConsumableStockLine;
  };
  weekly: ConsumablesWeek[];
}

/** Stock actual de palés/capuchones/sacas vacías + consumo semanal (salidas). */
export async function getConsumablesStats(): Promise<ConsumablesStats> {
  const weeks = lastNWeeks(5);
  const [consumables, movements] = await Promise.all([
    prisma.consumable.findMany({
      select: { type: true, currentStock: true, minStock: true },
    }),
    prisma.consumableMovement.findMany({
      where: { createdAt: { gte: weeks[0].start }, quantity: { lt: 0 } },
      select: {
        createdAt: true,
        quantity: true,
        consumable: { select: { type: true } },
      },
    }),
  ]);

  const stock = {
    pales: { current: 0, minimum: 0 },
    capuchones: { current: 0, minimum: 0 },
    sacas: { current: 0, minimum: 0 },
  };
  for (const c of consumables) {
    const line =
      c.type === ConsumableType.PALLET
        ? stock.pales
        : c.type === ConsumableType.CAPUCHON
          ? stock.capuchones
          : c.type === ConsumableType.SACA_VACIA
            ? stock.sacas
            : null;
    if (line) {
      line.current += c.currentStock;
      line.minimum += c.minStock;
    }
  }

  const weekly = weeks.map((w): ConsumablesWeek => ({
    label: w.label,
    range: w.range,
    isCurrent: w.isCurrent,
    pales: 0,
    capuchones: 0,
    sacas: 0,
  }));
  for (const m of movements) {
    const wi = weekIndexOf(weeks, m.createdAt);
    if (wi < 0) continue;
    const qty = Math.abs(m.quantity);
    if (m.consumable.type === ConsumableType.PALLET) weekly[wi].pales += qty;
    else if (m.consumable.type === ConsumableType.CAPUCHON)
      weekly[wi].capuchones += qty;
    else if (m.consumable.type === ConsumableType.SACA_VACIA)
      weekly[wi].sacas += qty;
  }

  return { stock, weekly };
}
