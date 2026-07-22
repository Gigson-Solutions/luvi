import { prisma } from "@/lib/prisma";
import { IncidentStatus, type Prisma } from "@prisma/client";

/**
 * Servicio de Incidencias — lógica de negocio sobre el modelo Incident.
 *
 * Lifecycle de estados (validado con schema):
 *   ABIERTA → EN_REVISION → EN_PROCESO → RESUELTA → CERRADA
 * Al pasar a RESUELTA se sella `resolvedAt`; al pasar a CERRADA, `closedAt`.
 *
 * Nota: `warehouseId` es un campo plano (sin relación en el schema), por lo que
 * los nombres de almacén se resuelven aparte vía getIncidentFormData().
 */

export type IncidentWithReporter = Prisma.IncidentGetPayload<{
  include: { reportedBy: { select: { id: true; name: true } } };
}>;

/** Orden del lifecycle. La transición avanza al siguiente estado. */
const STATUS_FLOW: IncidentStatus[] = [
  IncidentStatus.ABIERTA,
  IncidentStatus.EN_REVISION,
  IncidentStatus.EN_PROCESO,
  IncidentStatus.RESUELTA,
  IncidentStatus.CERRADA,
];

export interface ListIncidentsFilter {
  status?: IncidentStatus;
  warehouseId?: string;
}

/** Lista incidencias con filtro opcional por estado y por almacén. */
export function listIncidents(
  filter: ListIncidentsFilter = {},
): Promise<IncidentWithReporter[]> {
  return prisma.incident.findMany({
    where: {
      status: filter.status,
      warehouseId: filter.warehouseId,
    },
    include: { reportedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export type IncidentStats = Record<IncidentStatus, number>;

/** Recuento de incidencias por estado (para las StatCards). */
export async function getIncidentStats(): Promise<IncidentStats> {
  const grouped = await prisma.incident.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const stats: IncidentStats = {
    ABIERTA: 0,
    EN_REVISION: 0,
    EN_PROCESO: 0,
    RESUELTA: 0,
    CERRADA: 0,
  };
  for (const row of grouped) {
    stats[row.status] = row._count._all;
  }
  return stats;
}

// ─── Comparativa mensual por almacén ───────────────────────────────────────────

export interface MonthlyIncidentComparison {
  /** Claves de mes "YYYY-MM", de más antiguo a más reciente. */
  months: string[];
  rows: {
    warehouseId: string | null;
    warehouseName: string;
    /** Recuento por mes, alineado con `months`. */
    counts: number[];
    total: number;
  }[];
  /** Total de incidencias por mes, alineado con `months`. */
  monthTotals: number[];
}

/**
 * Comparativa del nº de incidencias por almacén y mes en los últimos
 * `monthsBack` meses. Los almacenes activos aparecen siempre (aunque con 0);
 * el bucket "Sin almacén" solo si hay incidencias sin almacén asignado.
 */
export async function getMonthlyIncidentsByWarehouse(
  monthsBack = 6,
): Promise<MonthlyIncidentComparison> {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth() - (monthsBack - 1),
    1,
  );

  const months: string[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  const [incidents, warehouses] = await Promise.all([
    prisma.incident.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true, warehouseId: true },
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rowMap = new Map<string | null, { name: string; counts: number[] }>();
  for (const w of warehouses) {
    rowMap.set(w.id, { name: w.name, counts: new Array(monthsBack).fill(0) });
  }

  const monthTotals = new Array<number>(monthsBack).fill(0);
  for (const inc of incidents) {
    const key = `${inc.createdAt.getFullYear()}-${String(
      inc.createdAt.getMonth() + 1,
    ).padStart(2, "0")}`;
    const mi = monthIndex.get(key);
    if (mi === undefined) continue;
    const wid = inc.warehouseId ?? null;
    if (!rowMap.has(wid)) {
      rowMap.set(wid, {
        name: wid ? "Almacén desconocido" : "Sin almacén",
        counts: new Array(monthsBack).fill(0),
      });
    }
    const row = rowMap.get(wid);
    if (row) row.counts[mi] += 1;
    monthTotals[mi] += 1;
  }

  const activeIds = new Set(warehouses.map((w) => w.id));
  const rows = Array.from(rowMap.entries())
    .map(([warehouseId, v]) => ({
      warehouseId,
      warehouseName: v.name,
      counts: v.counts,
      total: v.counts.reduce((a, b) => a + b, 0),
    }))
    .filter(
      (r) =>
        r.total > 0 || (r.warehouseId !== null && activeIds.has(r.warehouseId)),
    )
    .sort((a, b) => b.total - a.total);

  return { months, rows, monthTotals };
}

export interface CreateIncidentInput {
  title: string;
  description?: string;
  warehouseId?: string;
  sackQrCode?: string;
  photoUrl?: string;
  reportedById: string;
}

/** Crea una incidencia en estado inicial ABIERTA. */
export function createIncident(
  input: CreateIncidentInput,
): Promise<IncidentWithReporter> {
  return prisma.incident.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      warehouseId: input.warehouseId ?? null,
      sackQrCode: input.sackQrCode ?? null,
      photoUrl: input.photoUrl ?? null,
      reportedById: input.reportedById,
      status: IncidentStatus.ABIERTA,
    },
    include: { reportedBy: { select: { id: true, name: true } } },
  });
}

/**
 * Avanza la incidencia al siguiente estado del lifecycle.
 * Sella `resolvedAt` al llegar a RESUELTA y `closedAt` al llegar a CERRADA.
 */
export async function advanceIncidentStatus(
  id: string,
): Promise<IncidentWithReporter> {
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id } });

  const currentIndex = STATUS_FLOW.indexOf(incident.status);
  const nextStatus = STATUS_FLOW[currentIndex + 1];
  if (!nextStatus) {
    throw new Error("La incidencia ya está cerrada.");
  }

  return prisma.incident.update({
    where: { id },
    data: {
      status: nextStatus,
      resolvedAt:
        nextStatus === IncidentStatus.RESUELTA
          ? new Date()
          : incident.resolvedAt,
      closedAt:
        nextStatus === IncidentStatus.CERRADA ? new Date() : incident.closedAt,
    },
    include: { reportedBy: { select: { id: true, name: true } } },
  });
}

/** Datos auxiliares para formularios y filtros de incidencias. */
export function getIncidentFormData(): Promise<{
  warehouses: { id: string; name: string; code: string }[];
}> {
  return prisma.warehouse
    .findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    })
    .then((warehouses) => ({ warehouses }));
}
