import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ClipboardList,
} from "lucide-react";
import { IncidentStatus } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/card";
import {
  IncidentStatusBadge,
  INCIDENT_LABELS,
} from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/rbac";
import { UserRole } from "@prisma/client";
import {
  listIncidents,
  getIncidentStats,
  getIncidentFormData,
  getMonthlyIncidentsByWarehouse,
  type IncidentWithReporter,
} from "@/lib/services/incident.service";
import {
  NewIncidentDialog,
  ManageIncidentButton,
  ClosedIncidentDialog,
} from "./incident-dialogs";

const MONTH_ABBR = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** "YYYY-MM" → "jul 26". */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_ABBR[Number(m) - 1]} ${y.slice(2)}`;
}

const STATUS_VALUES = Object.values(IncidentStatus);

function isIncidentStatus(value: string | undefined): value is IncidentStatus {
  return value !== undefined && (STATUS_VALUES as string[]).includes(value);
}

/** Construye una query string preservando los filtros no modificados. */
function buildQuery(params: { status?: string; warehouse?: string }): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.warehouse) qs.set("warehouse", params.warehouse);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export default async function IncidenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; warehouse?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const statusFilter = isIncidentStatus(params.status)
    ? params.status
    : undefined;
  const warehouseFilter = params.warehouse || undefined;

  const [incidents, stats, formData, monthly, currentUser] = await Promise.all([
    listIncidents({ status: statusFilter, warehouseId: warehouseFilter }),
    getIncidentStats(),
    getIncidentFormData(),
    getMonthlyIncidentsByWarehouse(),
    getCurrentUser(),
  ]);

  // Solo ADMIN y MANAGER pueden reabrir incidencias cerradas/resueltas.
  const canReopen =
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === UserRole.MANAGER;

  const warehouseName = new Map(formData.warehouses.map((w) => [w.id, w.name]));
  const total = STATUS_VALUES.reduce((acc, s) => acc + stats[s], 0);

  // Activas = pendientes de cerrar; Cerradas = resueltas o cerradas.
  const ACTIVE_STATUSES = new Set<IncidentStatus>([
    IncidentStatus.ABIERTA,
    IncidentStatus.EN_REVISION,
    IncidentStatus.EN_PROCESO,
  ]);
  const activeIncidents = incidents.filter((i) =>
    ACTIVE_STATUSES.has(i.status),
  );
  const closedIncidents = incidents.filter(
    (i) => !ACTIVE_STATUSES.has(i.status),
  );

  const STAT_ACCENTS: Partial<Record<IncidentStatus, string>> = {
    ABIERTA: "var(--color-status-rechazo)",
    EN_REVISION: "var(--color-warning)",
    EN_PROCESO: "var(--color-primary)",
    RESUELTA: "var(--color-status-terminado)",
    CERRADA: "var(--color-muted)",
  };

  // Icono por estado — círculo de color en la StatCard (estilo Emergent).
  const STAT_ICONS: Record<IncidentStatus, React.ElementType> = {
    ABIERTA: AlertTriangle,
    EN_REVISION: Clock,
    EN_PROCESO: Clock,
    RESUELTA: CheckCircle2,
    CERRADA: XCircle,
  };

  return (
    <div>
      <PageHeader
        title="Incidencias"
        description="Gestión de incidencias de planta y almacén con seguimiento de estado."
        actions={<NewIncidentDialog warehouses={formData.warehouses} />}
      />

      {/* StatCards — recuento por estado + total */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {STATUS_VALUES.map((s) => (
          <StatCard
            key={s}
            label={INCIDENT_LABELS[s]}
            value={stats[s]}
            accent={STAT_ACCENTS[s]}
            icon={STAT_ICONS[s]}
            hint={
              total > 0
                ? `${Math.round((stats[s] / total) * 100)}% del total`
                : undefined
            }
          />
        ))}
        <StatCard label="Total" value={total} icon={ClipboardList} />
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className="text-xs font-medium text-[var(--color-muted)] mr-1">
          Estado:
        </span>
        <FilterChip
          href={buildQuery({ warehouse: warehouseFilter })}
          active={!statusFilter}
          label="Todas"
        />
        {STATUS_VALUES.map((s) => (
          <FilterChip
            key={s}
            href={buildQuery({ status: s, warehouse: warehouseFilter })}
            active={statusFilter === s}
            label={INCIDENT_LABELS[s]}
          />
        ))}
      </div>

      {/* Filtro por almacén */}
      {formData.warehouses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          <span className="text-xs font-medium text-[var(--color-muted)] mr-1">
            Almacén:
          </span>
          <FilterChip
            href={buildQuery({ status: statusFilter })}
            active={!warehouseFilter}
            label="Todos"
          />
          {formData.warehouses.map((w) => (
            <FilterChip
              key={w.id}
              href={buildQuery({ status: statusFilter, warehouse: w.id })}
              active={warehouseFilter === w.id}
              label={w.name}
            />
          ))}
        </div>
      )}

      {incidents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No hay incidencias"
          description="No se han registrado incidencias con los filtros seleccionados."
        />
      ) : (
        <div className="space-y-8">
          {/* Incidencias activas */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--color-status-rechazo)]" />
              <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
                Incidencias activas
                <span className="ml-2 font-normal text-[var(--color-muted)]">
                  {activeIncidents.length}
                </span>
              </h2>
            </div>
            {activeIncidents.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                No hay incidencias activas con los filtros seleccionados.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Estado</TH>
                    <TH>Título</TH>
                    <TH>Foto</TH>
                    <TH>Almacén</TH>
                    <TH>Autor</TH>
                    <TH>Fecha</TH>
                    <TH className="text-right">Acción</TH>
                  </TR>
                </THead>
                <TBody>
                  {activeIncidents.map((inc) => (
                    <IncidentRow
                      key={inc.id}
                      inc={inc}
                      warehouseName={warehouseName}
                      variant="activas"
                      canReopen={canReopen}
                    />
                  ))}
                </TBody>
              </Table>
            )}
          </section>

          {/* Incidencias cerradas (resueltas o cerradas). */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--color-muted)]" />
              <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
                Incidencias cerradas
                <span className="ml-2 font-normal text-[var(--color-muted)]">
                  {closedIncidents.length}
                </span>
              </h2>
            </div>
            {closedIncidents.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                No hay incidencias resueltas o cerradas con los filtros
                seleccionados.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Estado</TH>
                    <TH>Título</TH>
                    <TH>Foto</TH>
                    <TH>Almacén</TH>
                    <TH>Autor</TH>
                    <TH>Fecha</TH>
                    <TH>Resuelta</TH>
                    <TH className="text-right">Acción</TH>
                  </TR>
                </THead>
                <TBody>
                  {closedIncidents.map((inc) => (
                    <IncidentRow
                      key={inc.id}
                      inc={inc}
                      warehouseName={warehouseName}
                      variant="cerradas"
                      canReopen={canReopen}
                    />
                  ))}
                </TBody>
              </Table>
            )}
          </section>
        </div>
      )}

      {/* Comparativa mensual por almacén */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
          Comparativa mensual por almacén
          <span className="ml-2 font-normal text-[var(--color-muted)]">
            últimos {monthly.months.length} meses
          </span>
        </h2>
        {monthly.rows.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Sin datos para comparar"
            description="Aún no hay incidencias registradas en el periodo."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Almacén</TH>
                  {monthly.months.map((m) => (
                    <TH key={m} className="text-right">
                      {monthLabel(m)}
                    </TH>
                  ))}
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {monthly.rows.map((r) => (
                  <TR key={r.warehouseId ?? "none"}>
                    <TD className="font-medium">{r.warehouseName}</TD>
                    {r.counts.map((c, i) => (
                      <TD
                        key={i}
                        className={cn(
                          "text-right tabular-nums",
                          c === 0 && "text-[var(--color-muted)]",
                        )}
                      >
                        {c}
                      </TD>
                    ))}
                    <TD className="text-right font-semibold tabular-nums">
                      {r.total}
                    </TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-semibold text-[var(--color-muted)]">
                    Total
                  </TD>
                  {monthly.monthTotals.map((t, i) => (
                    <TD
                      key={i}
                      className="text-right font-semibold tabular-nums"
                    >
                      {t}
                    </TD>
                  ))}
                  <TD className="text-right font-semibold tabular-nums">
                    {monthly.monthTotals.reduce((a, b) => a + b, 0)}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Fila de incidencia. En "activas" muestra el diálogo de gestión de estado;
 *  en "cerradas" muestra la fecha de resolución y el detalle (con reapertura
 *  si el usuario es ADMIN/MANAGER). */
function IncidentRow({
  inc,
  warehouseName,
  variant,
  canReopen,
}: {
  inc: IncidentWithReporter;
  warehouseName: Map<string, string>;
  variant: "activas" | "cerradas";
  canReopen: boolean;
}): React.JSX.Element {
  return (
    <TR>
      <TD>
        <IncidentStatusBadge status={inc.status} />
      </TD>
      <TD className="font-medium">
        {inc.title}
        {inc.sackQrCode && (
          <span className="ml-2 text-xs text-[var(--color-muted)]">
            {inc.sackQrCode}
          </span>
        )}
      </TD>
      <TD>
        {inc.photoUrl ? (
          <a href={inc.photoUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={inc.photoUrl}
              alt={`Foto de ${inc.title}`}
              className="h-9 w-9 rounded object-cover border border-[var(--color-border)]"
            />
          </a>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        )}
      </TD>
      <TD>
        {inc.warehouseId ? (warehouseName.get(inc.warehouseId) ?? "—") : "—"}
      </TD>
      <TD>{inc.reportedBy.name}</TD>
      <TD>{formatDate(inc.createdAt, true)}</TD>
      {variant === "cerradas" ? (
        <>
          <TD>{inc.resolvedAt ? formatDate(inc.resolvedAt, true) : "—"}</TD>
          <TD className="text-right">
            <ClosedIncidentDialog
              id={inc.id}
              title={inc.title}
              status={inc.status}
              notes={inc.notes}
              canReopen={canReopen}
            />
          </TD>
        </>
      ) : (
        <TD className="text-right">
          <ManageIncidentButton
            id={inc.id}
            title={inc.title}
            status={inc.status}
            notes={inc.notes}
          />
        </TD>
      )}
    </TR>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}): React.JSX.Element {
  return (
    <Link
      href={`/incidencias${href}`}
      className={cn(
        "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
        active
          ? "bg-[var(--color-primary)] text-white"
          : "bg-[var(--color-surface-hover)] text-[var(--color-foreground)] hover:bg-[var(--color-border)]",
      )}
    >
      {label}
    </Link>
  );
}
