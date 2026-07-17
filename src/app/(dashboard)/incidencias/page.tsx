import Link from "next/link";
import { AlertTriangle } from "lucide-react";
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
import {
  listIncidents,
  getIncidentStats,
  getIncidentFormData,
  getMonthlyIncidentsByWarehouse,
} from "@/lib/services/incident.service";
import { NewIncidentDialog, AdvanceStatusButton } from "./incident-dialogs";

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

  const [incidents, stats, formData, monthly] = await Promise.all([
    listIncidents({ status: statusFilter, warehouseId: warehouseFilter }),
    getIncidentStats(),
    getIncidentFormData(),
    getMonthlyIncidentsByWarehouse(),
  ]);

  const warehouseName = new Map(formData.warehouses.map((w) => [w.id, w.name]));
  const total = STATUS_VALUES.reduce((acc, s) => acc + stats[s], 0);

  const STAT_ACCENTS: Partial<Record<IncidentStatus, string>> = {
    ABIERTA: "var(--color-status-rechazo)",
    EN_REVISION: "var(--color-warning)",
    EN_PROCESO: "var(--color-primary)",
    CERRADA: "var(--color-muted)",
  };

  return (
    <div>
      <PageHeader
        title="Incidencias"
        description="Gestión de incidencias de planta y almacén con seguimiento de estado."
        actions={<NewIncidentDialog warehouses={formData.warehouses} />}
      />

      {/* StatCards — recuento por estado */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {STATUS_VALUES.map((s) => (
          <StatCard
            key={s}
            label={INCIDENT_LABELS[s]}
            value={stats[s]}
            accent={STAT_ACCENTS[s]}
            hint={
              total > 0
                ? `${Math.round((stats[s] / total) * 100)}% del total`
                : undefined
            }
          />
        ))}
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
        <Table>
          <THead>
            <TR>
              <TH>Estado</TH>
              <TH>Título</TH>
              <TH>Almacén</TH>
              <TH>Autor</TH>
              <TH>Fecha</TH>
              <TH className="text-right">Acción</TH>
            </TR>
          </THead>
          <TBody>
            {incidents.map((inc) => (
              <TR key={inc.id}>
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
                  {inc.warehouseId
                    ? (warehouseName.get(inc.warehouseId) ?? "—")
                    : "—"}
                </TD>
                <TD>{inc.reportedBy.name}</TD>
                <TD>{formatDate(inc.createdAt, true)}</TD>
                <TD className="text-right">
                  <AdvanceStatusButton id={inc.id} status={inc.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
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
