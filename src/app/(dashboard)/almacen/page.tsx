import Link from "next/link";
import { Package, Warehouse as WarehouseIcon } from "lucide-react";
import { SackStatus } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatCard,
} from "@/components/ui/card";
import { SackStatusBadge, SACK_LABELS } from "@/components/ui/status-badge";
import { formatKg } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  getWarehouseOverview,
  listSacks,
  getWarehouseFilterData,
} from "@/lib/services/warehouse.service";
import { MoveSackDialog, TransferSacksDialog } from "./warehouse-client";

const STATUS_VALUES = Object.values(SackStatus);

function isSackStatus(value: string | undefined): value is SackStatus {
  return value !== undefined && (STATUS_VALUES as string[]).includes(value);
}

/** Construye una query string preservando los filtros no modificados. */
function buildQuery(params: {
  status?: string;
  material?: string;
  zone?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.material) qs.set("material", params.material);
  if (params.zone) qs.set("zone", params.zone);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export default async function AlmacenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; material?: string; zone?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const statusFilter = isSackStatus(params.status) ? params.status : undefined;
  const materialFilter = params.material || undefined;
  const zoneFilter = params.zone || undefined;

  const [overview, sacks, filterData] = await Promise.all([
    getWarehouseOverview(),
    listSacks({
      status: statusFilter,
      materialId: materialFilter,
      zoneId: zoneFilter,
    }),
    getWarehouseFilterData(),
  ]);

  const movableSacks = sacks
    .filter((s) => s.status === SackStatus.EN_ALMACEN)
    .map((s) => ({
      id: s.id,
      qrCode: s.qrCode,
      materialName: s.material.name,
      weight: s.weight,
      zoneId: s.zoneId,
      warehouseName: s.zone?.warehouse.name ?? null,
    }));

  return (
    <div>
      <PageHeader
        title="Almacén"
        description="Ocupación por zona, inventario de sacas y traslados entre zonas."
      />

      {/* StatCards — totales globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <StatCard
          label="Sacas en almacén"
          value={overview.stats.totalSacks}
          accent="var(--color-primary)"
        />
        <StatCard label="Peso total" value={formatKg(overview.stats.totalKg)} />
        <StatCard
          label="Zonas al límite"
          value={overview.stats.zonesAtLimit}
          accent={
            overview.stats.zonesAtLimit > 0
              ? "var(--color-status-rechazo)"
              : "var(--color-muted)"
          }
        />
      </div>

      {/* ─── Ocupación proyectada (global) ─── */}
      {overview.stats.totalCapacity > 0 && (
        <ProjectedOccupancy stats={overview.stats} />
      )}

      {/* ─── Ocupación por zona, agrupada por almacén ─── */}
      <section className="mb-10 space-y-6">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
          Ocupación por zona
        </h2>
        {overview.warehouses.length === 0 ? (
          <EmptyState
            icon={WarehouseIcon}
            title="No hay almacenes configurados"
            description="Configura almacenes y zonas para ver su ocupación."
          />
        ) : (
          overview.warehouses.map((wh) => (
            <Card key={wh.id}>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>
                  {wh.name}
                  <span className="ml-2 font-normal text-[var(--color-muted)]">
                    {wh.code}
                  </span>
                </CardTitle>
                <span className="text-xs text-[var(--color-muted)]">
                  {wh.totalSacks}/{wh.totalCapacity} sacas
                </span>
              </CardHeader>
              <CardContent>
                {wh.zones.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    Sin zonas configuradas.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {wh.zones.map((z) => (
                      <div key={z.id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <Link
                            href={`/almacen${buildQuery({ zone: z.id })}`}
                            className="font-medium text-[var(--color-foreground)] hover:underline"
                          >
                            {z.name}
                            <span className="ml-1.5 text-xs font-normal text-[var(--color-muted)]">
                              {z.code}
                            </span>
                          </Link>
                          <span
                            className={cn(
                              "text-xs tabular-nums",
                              z.atLimit
                                ? "text-[var(--color-status-rechazo)] font-medium"
                                : "text-[var(--color-muted)]",
                            )}
                          >
                            {z.sackCount}/{z.maxCapacity} · {z.pct}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[var(--color-surface-hover)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${z.pct}%`,
                              backgroundColor: z.atLimit
                                ? "var(--color-status-rechazo)"
                                : "var(--color-primary)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Proyección del almacén: actual + entrantes declarados */}
                {wh.totalCapacity > 0 && (
                  <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[var(--color-muted)]">
                        Proyectada{" "}
                        {wh.incomingSacks > 0 ? (
                          <span className="text-[var(--color-foreground)]">
                            +{wh.incomingSacks} entrante
                            {wh.incomingSacks === 1 ? "" : "s"} (
                            {wh.pendingContainers} pdte
                            {wh.pendingContainers === 1 ? "" : "s"})
                          </span>
                        ) : (
                          "sin entrantes"
                        )}
                      </span>
                      <span
                        className={cn(
                          "tabular-nums",
                          wh.projectedSacks > wh.totalCapacity
                            ? "font-medium text-[var(--color-status-rechazo)]"
                            : "text-[var(--color-muted)]",
                        )}
                      >
                        {wh.projectedSacks}/{wh.totalCapacity} · {wh.pctProjected}
                        %
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-hover)]">
                      <div
                        className="h-full"
                        style={{
                          width: `${wh.pctActual}%`,
                          backgroundColor: "var(--color-primary)",
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(0, wh.pctProjected - wh.pctActual)}%`,
                          backgroundColor:
                            wh.projectedSacks > wh.totalCapacity
                              ? "var(--color-status-rechazo)"
                              : "var(--color-primary)",
                          opacity: 0.4,
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* ─── Inventario de sacas + filtros ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
            Inventario de sacas
            <span className="ml-2 font-normal text-[var(--color-muted)]">
              {sacks.length}
            </span>
          </h2>
          {movableSacks.length > 0 && (
            <TransferSacksDialog
              movableSacks={movableSacks}
              zones={filterData.zones}
            />
          )}
        </div>

        {/* Filtro por estado */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-xs font-medium text-[var(--color-muted)] mr-1">
            Estado:
          </span>
          <FilterChip
            href={buildQuery({ material: materialFilter, zone: zoneFilter })}
            active={!statusFilter}
            label="Todos"
          />
          {STATUS_VALUES.map((s) => (
            <FilterChip
              key={s}
              href={buildQuery({
                status: s,
                material: materialFilter,
                zone: zoneFilter,
              })}
              active={statusFilter === s}
              label={SACK_LABELS[s]}
            />
          ))}
        </div>

        {/* Filtro por material */}
        {filterData.materials.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-xs font-medium text-[var(--color-muted)] mr-1">
              Material:
            </span>
            <FilterChip
              href={buildQuery({ status: statusFilter, zone: zoneFilter })}
              active={!materialFilter}
              label="Todos"
            />
            {filterData.materials.map((m) => (
              <FilterChip
                key={m.id}
                href={buildQuery({
                  status: statusFilter,
                  material: m.id,
                  zone: zoneFilter,
                })}
                active={materialFilter === m.id}
                label={m.name}
              />
            ))}
          </div>
        )}

        {/* Filtro por zona */}
        {filterData.zones.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-xs font-medium text-[var(--color-muted)] mr-1">
              Zona:
            </span>
            <FilterChip
              href={buildQuery({
                status: statusFilter,
                material: materialFilter,
              })}
              active={!zoneFilter}
              label="Todas"
            />
            {filterData.zones.map((z) => (
              <FilterChip
                key={z.id}
                href={buildQuery({
                  status: statusFilter,
                  material: materialFilter,
                  zone: z.id,
                })}
                active={zoneFilter === z.id}
                label={`${z.warehouseName} · ${z.name}`}
              />
            ))}
          </div>
        )}

        {sacks.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No hay sacas"
            description="No se han encontrado sacas con los filtros seleccionados."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>QR</TH>
                <TH>Material</TH>
                <TH>Peso</TH>
                <TH>Estado</TH>
                <TH>Zona</TH>
                <TH>Lote / Contenedor</TH>
                <TH className="text-right">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {sacks.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">
                    <Link
                      href={`/almacen/${s.id}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {s.qrCode}
                    </Link>
                  </TD>
                  <TD>{s.material.name}</TD>
                  <TD>{formatKg(s.weight)}</TD>
                  <TD>
                    <SackStatusBadge status={s.status} />
                  </TD>
                  <TD>
                    {s.zone ? (
                      <span>
                        {s.zone.warehouse.name} · {s.zone.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    {s.lot ? (
                      <span className="text-[var(--color-foreground)]">
                        {s.lot.lotNumber}
                      </span>
                    ) : s.container ? (
                      <span className="text-[var(--color-muted)]">
                        {s.container.reference}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-right">
                    {s.status === SackStatus.EN_ALMACEN && (
                      <MoveSackDialog
                        sackId={s.id}
                        qrCode={s.qrCode}
                        currentZoneId={s.zoneId}
                        zones={filterData.zones}
                      />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function ProjectedOccupancy({
  stats,
}: {
  stats: {
    totalSacks: number;
    totalCapacity: number;
    incomingSacks: number;
    pendingContainers: number;
    projectedSacks: number;
    pctActual: number;
    pctProjected: number;
    unassignedIncoming: number;
    unassignedContainers: number;
  };
}): React.JSX.Element {
  // Segmento de entrantes = tramo que la proyección añade sobre lo actual.
  const incomingPct = Math.max(0, stats.pctProjected - stats.pctActual);
  const overCapacity = stats.projectedSacks > stats.totalCapacity;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
        Ocupación proyectada
        <span className="ml-2 font-normal text-[var(--color-muted)]">total</span>
      </h2>
      <Card>
        <CardContent className="py-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span className="text-[var(--color-muted)]">
              Actual{" "}
              <span className="font-medium text-[var(--color-foreground)] tabular-nums">
                {stats.totalSacks}/{stats.totalCapacity}
              </span>{" "}
              · {stats.pctActual}%
            </span>
            <span className="text-[var(--color-muted)]">
              {stats.incomingSacks > 0 ? (
                <>
                  +{" "}
                  <span className="font-medium text-[var(--color-foreground)] tabular-nums">
                    {stats.incomingSacks}
                  </span>{" "}
                  entrantes ({stats.pendingContainers} contenedor
                  {stats.pendingContainers === 1 ? "" : "es"} pdte
                  {stats.pendingContainers === 1 ? "" : "s"})
                </>
              ) : (
                "Sin contenedores pendientes"
              )}
            </span>
            <span
              className={cn(
                "font-medium tabular-nums",
                overCapacity
                  ? "text-[var(--color-status-rechazo)]"
                  : "text-[var(--color-foreground)]",
              )}
            >
              → Proyectada {stats.projectedSacks}/{stats.totalCapacity} ·{" "}
              {stats.pctProjected}%
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-hover)]">
            <div
              className="h-full transition-all"
              style={{
                width: `${stats.pctActual}%`,
                backgroundColor: "var(--color-primary)",
              }}
            />
            <div
              className="h-full transition-all"
              style={{
                width: `${incomingPct}%`,
                backgroundColor: overCapacity
                  ? "var(--color-status-rechazo)"
                  : "var(--color-primary)",
                opacity: 0.4,
              }}
            />
          </div>
          {overCapacity && (
            <p className="mt-2 text-xs font-medium text-[var(--color-status-rechazo)]">
              Los entrantes superan la capacidad global disponible.
            </p>
          )}
          {stats.unassignedIncoming > 0 && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Incluye {stats.unassignedIncoming} saca
              {stats.unassignedIncoming === 1 ? "" : "s"} de{" "}
              {stats.unassignedContainers} contenedor
              {stats.unassignedContainers === 1 ? "" : "es"} pendiente
              {stats.unassignedContainers === 1 ? "" : "s"} sin almacén destino
              asignado (no se reparten por almacén).
            </p>
          )}
        </CardContent>
      </Card>
    </section>
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
      href={`/almacen${href}`}
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
