import Link from "next/link";
import {
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Calendar,
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
  listMonthlyRecords,
  getMonthlyStats,
  getDensityRange,
  toRecordSummary,
} from "@/lib/services/quality.service";
import {
  NewRecordDialog,
  SampleEditorDialog,
  DeleteRecordButton,
  type EditorRecordData,
} from "./quality-editor";

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

function monthHref(year: number, month: number): string {
  return `/calidad?year=${year}&month=${month}`;
}

export default async function CalidadPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = clampMonth(Number(params.month) || now.getMonth() + 1);

  const [records, stats, range] = await Promise.all([
    listMonthlyRecords(year, month),
    getMonthlyStats(year, month),
    getDensityRange(),
  ]);

  const summaries = records.map(toRecordSummary);

  // Navegación mes anterior / siguiente
  const prev =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next =
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return (
    <div>
      <PageHeader
        title="Calidad"
        description="Registros de calidad por día, turno y cliente con hoja de 20 muestras."
        actions={<NewRecordDialog />}
      />

      {/* Navegación por mes/año */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={monthHref(prev.year, prev.month)} aria-label="Mes anterior">
          <Button variant="outline" size="icon">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <span className="min-w-40 text-center text-sm font-semibold text-[var(--color-foreground)]">
          {MONTHS[month - 1]} {year}
        </span>
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
        <StatCard label="Registros" value={stats.totalRecords} />
        <StatCard label="Muestras" value={stats.totalSamples} />
        <StatCard
          label="Promedio densidad"
          value={
            stats.avgDensity == null ? "—" : `${stats.avgDensity.toFixed(1)} g`
          }
        />
        <StatCard
          label="Días NOK"
          value={stats.nokDays}
          accent="var(--color-danger, #dc2626)"
        />
      </div>

      {/* Tabla de registros del mes */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
          Registros de {MONTHS[month - 1]} {year}
          <span className="ml-2 font-normal text-[var(--color-muted)]">
            {summaries.length}
          </span>
        </h2>
        {summaries.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No hay registros para este mes"
            description="Crea un registro con el botón «Nuevo Registro»."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Turno</TH>
                  <TH>Cliente</TH>
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
                            range={range}
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
