import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatCard,
} from "@/components/ui/card";
import { formatKg } from "@/lib/utils";
import { SACK_LABELS, SHIPMENT_LABELS } from "@/components/ui/status-badge";
import {
  getWarehouseDashboard,
  getProductionDashboard,
  getLogisticsDashboard,
  getQualityDashboard,
  getProcurementDashboard,
  resolveRange,
  toDateInput,
} from "@/lib/services/dashboard.service";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { MiniBarChart } from "./dashboard-charts";

const LOT_LABELS: Record<string, string> = {
  PRODUCTO_TERMINADO: "Producto terminado",
  SUBPRODUCTO: "Subproducto",
  RECHAZO: "Rechazo",
};

export default async function DashboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const range = resolveRange(params.from, params.to);

  const [wh, prod, log, qua, proc] = await Promise.all([
    getWarehouseDashboard(),
    getProductionDashboard(range),
    getLogisticsDashboard(range),
    getQualityDashboard(range),
    getProcurementDashboard(),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboards"
        description="Indicadores por rango de fecha: almacén, producción, logística, calidad y aprovisionamiento."
      />

      <DateRangeFilter
        from={toDateInput(range.from)}
        to={toDateInput(range.to)}
      />

      {/* ─── Almacén (estado actual) ─────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Almacén
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Sacas en almacén" value={wh.totalSacks} />
          <StatCard
            label="Peso almacenado"
            value={formatKg(wh.totalKg)}
            accent="var(--color-primary)"
          />
          <StatCard
            label="Zonas al límite"
            value={wh.zonesAtLimit}
            accent={
              wh.zonesAtLimit > 0 ? "var(--color-status-rechazo)" : undefined
            }
          />
          <StatCard label="Zonas totales" value={wh.zones.length} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Sacas por estado</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniBarChart
                data={wh.byStatus.map((s) => ({
                  label: SACK_LABELS[s.status],
                  value: s.count,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Ocupación por zona</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniBarChart
                data={wh.zones.map((z) => ({ label: z.name, value: z.used }))}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── Producción ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Producción
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Lotes" value={prod.lots} />
          <StatCard
            label="Kg producidos"
            value={formatKg(prod.kgProduced)}
            accent="var(--color-primary)"
          />
          <StatCard
            label="Sacas en producción"
            value={prod.sacksInProduction}
            accent="var(--color-status-produccion)"
          />
          <StatCard label="Tipos de salida" value={prod.byType.length} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Kg por tipo de salida</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart
              data={prod.byType.map((t) => ({
                label: LOT_LABELS[t.type],
                value: Math.round(t.kg),
              }))}
              colors={["#15803d", "#0ea5e9", "#ef4444"]}
            />
          </CardContent>
        </Card>
      </section>

      {/* ─── Logística / Expediciones ────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Logística y Expediciones
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard
            label="Kg expedidos"
            value={formatKg(log.kgExpedited)}
            accent="var(--color-status-expedido)"
          />
          <StatCard label="Envíos" value={log.shipments} />
          <StatCard
            label="Envíos activos"
            value={log.byStatus.reduce((a, s) => a + s.count, 0)}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Envíos por estado</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart
              data={log.byStatus.map((s) => ({
                label: SHIPMENT_LABELS[s.status],
                value: s.count,
              }))}
              colors={["#9ca3af", "#f59e0b", "#0ea5e9", "#15803d"]}
            />
          </CardContent>
        </Card>
      </section>

      {/* ─── Calidad + Aprovisionamiento ─────────────────────────── */}
      <section>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Calidad</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="OK"
                  value={qua.ok}
                  accent="var(--color-status-terminado)"
                />
                <StatCard
                  label="NOK"
                  value={qua.nok}
                  accent="var(--color-status-rechazo)"
                />
                <StatCard label="% Rechazo" value={`${qua.rejectRate}%`} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Aprovisionamiento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Pedidos abiertos" value={proc.openOrders} />
                <StatCard
                  label="TN en tránsito"
                  value={proc.tonsInTransit}
                  accent="var(--color-primary)"
                />
                <StatCard
                  label="Envíos en camino"
                  value={proc.shipmentsInTransit}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
