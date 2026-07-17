import { ClipboardCheck, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/card";
import { QualityResultBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import {
  listQualityRecords,
  getQualityAverages,
  getQualityFormData,
} from "@/lib/services/quality.service";
import {
  MEASURE_KEYS,
  MEASURE_LABELS,
  SAMPLE_TYPE_LABELS,
  type SampleType,
} from "./quality-thresholds";
import { NewQualityDialog, EditResultDialog } from "./quality-dialogs";

const SHIFT_LABELS: Record<string, string> = {
  M: "Mañana",
  T: "Tarde",
  N: "Noche",
};

function fmtNum(n: number | null | undefined): string {
  return n == null ? "—" : n.toFixed(2);
}

function sampleTypeLabel(t: string | null): string {
  if (!t) return "—";
  return SAMPLE_TYPE_LABELS[t as SampleType] ?? t;
}

/** Convierte un "YYYY-MM" en el rango [from, to) del mes. null si no es válido. */
function monthRange(
  month: string | undefined,
): { from: Date; to: Date } | null {
  if (!month) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  return { from: new Date(year, mon - 1, 1), to: new Date(year, mon, 1) };
}

export default async function CalidadPage({
  searchParams,
}: {
  searchParams: Promise<{
    supplier?: string;
    material?: string;
    month?: string;
  }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const supplierFilter = params.supplier || undefined;
  const materialFilter = params.material || undefined;
  const range = monthRange(params.month);

  const [records, averages, formData] = await Promise.all([
    listQualityRecords(),
    getQualityAverages({
      supplierId: supplierFilter,
      materialId: materialFilter,
      from: range?.from,
      to: range?.to,
    }),
    getQualityFormData(),
  ]);

  const okCount = records.filter((r) => r.result === "OK").length;
  const nokCount = records.filter((r) => r.result === "NOK").length;
  const pendingCount = records.filter((r) => r.result === "PENDIENTE").length;

  return (
    <div>
      <PageHeader
        title="Calidad"
        description="Registros de calidad por lote y promedios por proveedor/material."
        actions={
          <NewQualityDialog
            lots={formData.lots}
            materials={formData.materials}
            suppliers={formData.suppliers}
          />
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Registros" value={records.length} />
        <StatCard
          label="OK"
          value={okCount}
          accent="var(--color-success, #16a34a)"
        />
        <StatCard
          label="NOK"
          value={nokCount}
          accent="var(--color-danger, #dc2626)"
        />
        <StatCard label="Pendientes" value={pendingCount} />
      </div>

      {/* Listado de registros */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Registros
          <span className="ml-2 text-[var(--color-muted)] font-normal">
            {records.length}
          </span>
        </h2>
        {records.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No hay registros de calidad"
            description="Crea un registro seleccionando un lote de producción."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Lote</TH>
                  <TH>Material</TH>
                  <TH>Proveedor</TH>
                  <TH>Muestra</TH>
                  <TH>Turno</TH>
                  <TH>Resultado</TH>
                  <TH>Fecha</TH>
                  <TH className="text-right">Acción</TH>
                </TR>
              </THead>
              <TBody>
                {records.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.lot.lotNumber}</TD>
                    <TD>{r.material.name}</TD>
                    <TD>{r.supplier?.name ?? "—"}</TD>
                    <TD>{sampleTypeLabel(r.sampleType)}</TD>
                    <TD>
                      {r.shift ? (SHIFT_LABELS[r.shift] ?? r.shift) : "—"}
                    </TD>
                    <TD>
                      <QualityResultBadge result={r.result} />
                    </TD>
                    <TD>{formatDate(r.recordedAt, true)}</TD>
                    <TD className="text-right">
                      <EditResultDialog
                        id={r.id}
                        lotNumber={r.lot.lotNumber}
                        currentResult={r.result}
                        currentOverrideReason={r.overrideReason}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>

      {/* Promedios por proveedor/material/periodo */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Promedios por proveedor / material
        </h2>

        {/* Filtros: proveedor · material · mes (GET, sin JS) */}
        <form
          method="get"
          className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <div>
            <label
              htmlFor="f-supplier"
              className="mb-1 block text-xs text-[var(--color-muted)]"
            >
              Proveedor
            </label>
            <select
              id="f-supplier"
              name="supplier"
              defaultValue={supplierFilter ?? ""}
              className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
            >
              <option value="">Todos</option>
              {formData.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="f-material"
              className="mb-1 block text-xs text-[var(--color-muted)]"
            >
              Material
            </label>
            <select
              id="f-material"
              name="material"
              defaultValue={materialFilter ?? ""}
              className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
            >
              <option value="">Todos</option>
              {formData.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="f-month"
              className="mb-1 block text-xs text-[var(--color-muted)]"
            >
              Mes
            </label>
            <input
              id="f-month"
              type="month"
              name="month"
              defaultValue={params.month ?? ""}
              className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white"
          >
            Filtrar
          </button>
          {(supplierFilter || materialFilter || params.month) && (
            <a
              href="/calidad"
              className="h-9 px-2 text-sm text-[var(--color-muted)] hover:underline leading-9"
            >
              Limpiar
            </a>
          )}
        </form>

        {averages.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Sin datos para promediar"
            description="Los promedios aparecerán al registrar medidas de calidad."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Proveedor</TH>
                  <TH>Material</TH>
                  <TH className="text-right">Nº</TH>
                  {MEASURE_KEYS.map((k) => (
                    <TH key={k} className="text-right">
                      {MEASURE_LABELS[k]}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {averages.map((g) => (
                  <TR key={`${g.supplierId ?? "none"}-${g.materialId}`}>
                    <TD className="font-medium">{g.supplierName}</TD>
                    <TD>{g.materialName}</TD>
                    <TD className="text-right">{g.count}</TD>
                    {MEASURE_KEYS.map((k) => (
                      <TD key={k} className="text-right tabular-nums">
                        {fmtNum(g.averages[k])}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
