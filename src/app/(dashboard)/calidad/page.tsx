import Link from "next/link";
import {
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Calendar,
  BarChart3,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/card";
import { QualityResultBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import type { QualityResult } from "@prisma/client";
import {
  listRecords,
  listQualityClients,
  computeStats,
  monthBounds,
  getQualityRanges,
  resolveAllMaterialRanges,
  toRecordSummary,
} from "@/lib/services/quality.service";
import { listMaterials } from "@/lib/services/config.service";
import {
  NewRecordDialog,
  SampleEditorDialog,
  DeleteRecordButton,
  MonthYearNav,
  type EditorRecordData,
} from "./quality-editor";
import { QualityFilters } from "./quality-filters";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function clampMonth(n: number): number {
  return Number.isInteger(n) && n >= 1 && n <= 12
    ? n
    : new Date().getMonth() + 1;
}

/** Un parámetro repetible de la URL siempre como lista de valores. */
function asList(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Fecha local de un "YYYY-MM-DD" de la URL; null si no es válida. */
function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function CalidadPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    desde?: string;
    hasta?: string;
    cliente?: string | string[];
    producto?: string | string[];
  }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = clampMonth(Number(params.month) || now.getMonth() + 1);
  const clients = asList(params.cliente);
  const materialIds = asList(params.producto);

  // Con fechas, el periodo es ese rango (ambos extremos incluidos); sin ellas,
  // el mes elegido. Un solo extremo deja el otro abierto.
  const fromDay = parseDay(params.desde);
  const toDay = parseDay(params.hasta);
  const byRange = fromDay != null || toDay != null;
  const period = byRange
    ? {
        from: fromDay ?? new Date(2000, 0, 1),
        to: toDay
          ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1)
          : new Date(9999, 0, 1),
      }
    : monthBounds(year, month);

  const [records, ranges, rangesByMaterial, allMaterials, clientOptions] =
    await Promise.all([
      listRecords({ ...period, clients, materialIds }),
      getQualityRanges(),
      resolveAllMaterialRanges(),
      listMaterials(),
      listQualityClients(),
    ]);

  const stats = computeStats(records);
  const summaries = records.map(toRecordSummary);
  const hasFilters = clients.length > 0 || materialIds.length > 0;

  /** Enlace a otro mes conservando cliente/producto (sin rango de fechas). */
  function monthHref(y: number, m: number): string {
    const qs = new URLSearchParams({ year: String(y), month: String(m) });
    for (const c of clients) qs.append("cliente", c);
    for (const id of materialIds) qs.append("producto", id);
    return `/calidad?${qs.toString()}`;
  }

  const periodLabel = byRange
    ? fromDay && toDay
      ? `del ${formatDate(fromDay)} al ${formatDate(toDay)}`
      : fromDay
        ? `desde el ${formatDate(fromDay)}`
        : `hasta el ${formatDate(toDay as Date)}`
    : `de ${MONTHS[month - 1]} ${year}`;
  const materials = allMaterials
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, name: m.name }));

  // Navegación mes anterior / siguiente
  const prev =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next =
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return (
    <div>
      <PageHeader
        icon={ClipboardCheck}
        title="Calidad"
        description="Registros de calidad por día, turno y cliente con hoja de 20 muestras."
        actions={<NewRecordDialog materials={materials} />}
      />

      <QualityFilters clients={clientOptions} materials={materials} />

      {/* Navegación por mes/año */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={monthHref(prev.year, prev.month)} aria-label="Mes anterior">
          <Button variant="outline" size="icon">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <MonthYearNav year={year} month={month} />
        <Link
          href={monthHref(next.year, next.month)}
          aria-label="Mes siguiente"
        >
          <Button variant="outline" size="icon">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
        <Link href={monthHref(now.getFullYear(), now.getMonth() + 1)}>
          <Button variant="ghost" size="sm">
            <Calendar className="w-4 h-4" /> Hoy
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Registros"
          value={stats.totalRecords}
          icon={ClipboardCheck}
          accent="#2563eb"
        />
        <StatCard
          label="Muestras"
          value={stats.totalSamples}
          icon={BarChart3}
          accent="#8b5cf6"
        />
        <StatCard
          label="Promedio densidad"
          value={
            stats.avgDensity == null ? "—" : `${stats.avgDensity.toFixed(1)} g`
          }
          icon={TrendingUp}
          accent="#15803d"
        />
        <StatCard
          label="Días NOK"
          value={stats.nokDays}
          icon={XCircle}
          accent="#dc2626"
        />
      </div>

      {/* Tabla de registros del mes */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
          Registros {periodLabel}
          <span className="ml-2 font-normal text-[var(--color-muted)]">
            {summaries.length}
          </span>
        </h2>
        {summaries.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={
              byRange || hasFilters
                ? "No hay registros con estos filtros"
                : "No hay registros para este mes"
            }
            description={
              byRange || hasFilters
                ? "Cambia las fechas, el cliente o el producto, o limpia los filtros."
                : "Crea un registro con el botón «Nuevo Registro»."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Turno</TH>
                  <TH>Cliente</TH>
                  <TH>Producto</TH>
                  <TH className="text-right">Muestras</TH>
                  <TH className="text-right">Densidad Prom.</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {summaries.map((s, i) => {
                  const editorData: EditorRecordData = {
                    id: s.id,
                    dateLabel: s.date ? formatDate(s.date) : "Sin fecha",
                    shift: s.shift,
                    client: s.client,
                    notes: s.notes,
                    materialId: s.materialId,
                    samples: records[i].samples.map((sm) => ({
                      index: sm.index,
                      density: sm.density,
                      pvc: sm.pvc,
                      cola: sm.cola,
                      multicapas: sm.multicapas,
                      metal: sm.metal,
                      otros: sm.otros,
                      comment: sm.comment,
                    })),
                  };
                  return (
                    <TR key={s.id}>
                      <TD className="font-medium">
                        {s.date ? formatDate(s.date) : "—"}
                      </TD>
                      <TD>{s.shift ?? "—"}</TD>
                      <TD>{s.client ?? "—"}</TD>
                      <TD>{s.materialName ?? "—"}</TD>
                      <TD className="text-right tabular-nums">
                        {s.sampleCount}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {s.avgDensity == null
                          ? "—"
                          : `${s.avgDensity.toFixed(1)} g`}
                      </TD>
                      <TD>
                        <QualityResultBadge
                          result={s.status as QualityResult}
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <SampleEditorDialog
                            record={editorData}
                            ranges={ranges}
                            materials={materials}
                            rangesByMaterial={rangesByMaterial}
                          />
                          <DeleteRecordButton id={s.id} />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
