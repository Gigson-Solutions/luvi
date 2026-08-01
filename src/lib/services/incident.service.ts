import { prisma } from "@/lib/prisma";
import { IncidentStatus, type Incident, type Prisma } from "@prisma/client";

/**
 * Servicio de Incidencias — lógica de negocio sobre el modelo Incident.
 *
 * Lifecycle de estados (validado con schema):
 *   ABIERTA → EN_REVISION → EN_PROCESO → RESUELTA → CERRADA
 * Al pasar a RESUELTA se sella `resolvedAt`; al pasar a CERRADA, `closedAt`.
 * Cada cambio de estado (setIncidentStatus / reopen / advance) deja un
 * `IncidentNote` con el actor, la nota y la transición (fromStatus → toStatus).
 *
 * Nota: `warehouseId` es un campo plano (sin relación en el schema), por lo que
 * los nombres de almacén se resuelven aparte vía getIncidentFormData(). Igual
 * ocurre con `IncidentNote.userId`: se resuelve el nombre del actor por separado.
 */

/** Nota de historial ya enriquecida con el nombre del actor (serializable). */
export interface IncidentNoteView {
  id: string;
  note: string;
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus | null;
  createdAt: Date;
  actorName: string | null;
}

type IncidentBase = Prisma.IncidentGetPayload<{
  include: { reportedBy: { select: { id: true; name: true } } };
}>;

/** Incidencia con su autor y el historial cronológico de notas. */
export interface IncidentWithReporter extends IncidentBase {
  notes: IncidentNoteView[];
}

type RawIncident = Prisma.IncidentGetPayload<{
  include: {
    reportedBy: { select: { id: true; name: true } };
    notes: true;
  };
}>;

/**
 * Resuelve los nombres de los actores de las notas (userId → name) y devuelve
 * las incidencias con el historial ya enriquecido y listo para el cliente.
 */
async function enrichIncidents(
  incidents: RawIncident[],
): Promise<IncidentWithReporter[]> {
  const userIds = [
    ...new Set(
      incidents
        .flatMap((i) => i.notes)
        .map((n) => n.userId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return incidents.map((incident) => ({
    ...incident,
    notes: incident.notes.map((n) => ({
      id: n.id,
      note: n.note,
      fromStatus: n.fromStatus,
      toStatus: n.toStatus,
      createdAt: n.createdAt,
      actorName: n.userId ? (nameById.get(n.userId) ?? null) : null,
    })),
  }));
}

/** Opciones comunes a los cambios de estado: nota y actor que la registra. */
export interface StatusChangeOptions {
  note?: string;
  actorId?: string;
}

/**
 * Aplica un cambio de estado y registra la IncidentNote correspondiente en una
 * única transacción. Sella `resolvedAt`/`closedAt` según el destino, o los
 * limpia si `clearTimestamps` (reapertura). Los sellos previos se conservan.
 */
async function applyStatusChange(
  incident: Incident,
  status: IncidentStatus,
  opts: StatusChangeOptions & { clearTimestamps?: boolean } = {},
): Promise<void> {
  const data: Prisma.IncidentUpdateInput = { status };
  if (opts.clearTimestamps) {
    data.resolvedAt = null;
    data.closedAt = null;
  } else {
    data.resolvedAt =
      status === IncidentStatus.RESUELTA
        ? (incident.resolvedAt ?? new Date())
        : incident.resolvedAt;
    data.closedAt =
      status === IncidentStatus.CERRADA
        ? (incident.closedAt ?? new Date())
        : incident.closedAt;
  }

  await prisma.$transaction([
    prisma.incident.update({ where: { id: incident.id }, data }),
    prisma.incidentNote.create({
      data: {
        incidentId: incident.id,
        userId: opts.actorId ?? null,
        note: opts.note ?? "",
        fromStatus: incident.status,
        toStatus: status,
      },
    }),
  ]);
}

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
export async function listIncidents(
  filter: ListIncidentsFilter = {},
): Promise<IncidentWithReporter[]> {
  const incidents = await prisma.incident.findMany({
    where: {
      status: filter.status,
      warehouseId: filter.warehouseId,
    },
    include: {
      reportedBy: { select: { id: true, name: true } },
      notes: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return enrichIncidents(incidents);
}

/** Recupera una incidencia con su historial de notas, o lanza si no existe. */
export async function getIncidentById(
  id: string,
): Promise<IncidentWithReporter> {
  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id },
    include: {
      reportedBy: { select: { id: true, name: true } },
      notes: { orderBy: { createdAt: "asc" } },
    },
  });
  return (await enrichIncidents([incident]))[0];
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

/** Crea una incidencia en estado inicial ABIERTA (sin historial todavía). */
export async function createIncident(
  input: CreateIncidentInput,
): Promise<IncidentWithReporter> {
  const created = await prisma.incident.create({
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
  return { ...created, notes: [] };
}

/**
 * Avanza la incidencia al siguiente estado del lifecycle y registra la nota.
 * Sella `resolvedAt` al llegar a RESUELTA y `closedAt` al llegar a CERRADA.
 */
export async function advanceIncidentStatus(
  id: string,
  opts: StatusChangeOptions = {},
): Promise<IncidentWithReporter> {
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id } });

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(incident.status) + 1];
  if (!nextStatus) {
    throw new Error("La incidencia ya está cerrada.");
  }

  await applyStatusChange(incident, nextStatus, opts);
  return getIncidentById(id);
}

/**
 * Cambia la incidencia a cualquier estado destino (no solo el siguiente) y
 * registra una IncidentNote con la transición. Sella `resolvedAt`/`closedAt`
 * según el destino, conservando los sellos previos si ya existían.
 */
export async function setIncidentStatus(
  id: string,
  status: IncidentStatus,
  opts: StatusChangeOptions = {},
): Promise<IncidentWithReporter> {
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id } });
  await applyStatusChange(incident, status, opts);
  return getIncidentById(id);
}

/** Estados válidos de reapertura: la incidencia vuelve a estar activa. */
export const REOPEN_STATUSES: IncidentStatus[] = [
  IncidentStatus.ABIERTA,
  IncidentStatus.EN_PROCESO,
];

/**
 * Reabre una incidencia resuelta o cerrada, devolviéndola a ABIERTA o
 * EN_PROCESO. Limpia `resolvedAt`/`closedAt` y registra la IncidentNote.
 * La comprobación de rol (ADMIN/MANAGER) es responsabilidad de la action.
 */
export async function reopenIncident(
  id: string,
  status: IncidentStatus,
  opts: StatusChangeOptions = {},
): Promise<IncidentWithReporter> {
  if (!REOPEN_STATUSES.includes(status)) {
    throw new Error("Solo se puede reabrir a Abierta o En proceso.");
  }
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id } });
  await applyStatusChange(incident, status, { ...opts, clearTimestamps: true });
  return getIncidentById(id);
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
