import Link from "next/link";
import {
  Factory,
  TrendingDown,
  MapPin,
  Ship,
  Package,
  Warehouse,
  ShoppingCart,
  BarChart3,
  Recycle,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatCard,
} from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { MiniBarChart } from "../dashboards/dashboard-charts";
import { formatKg, cn } from "@/lib/utils";
import {
  getProductionStats,
  getConsumptionStats,
  getLocationStats,
  getExpectedStock,
  getConsumablesStats,
  type ProviderStat,
} from "@/lib/services/inventory.service";

type Tab =
  "produccion" | "consumido" | "ubicacion" | "esperado" | "consumibles";

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: "produccion", label: "Producción", icon: Factory },
  { value: "consumido", label: "Consumido", icon: TrendingDown },
  { value: "ubicacion", label: "Ubicación", icon: MapPin },
  { value: "esperado", label: "Esperado", icon: Ship },
  { value: "consumibles", label: "Consumibles", icon: Package },
];

const PROVIDER_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#0ea5e9",
  "#14b8a6",
  "#f97316",
  "#84cc16",
];

function isTab(v: string | undefined): v is Tab {
  return (
    v === "produccion" ||
    v === "consumido" ||
    v === "ubicacion" ||
    v === "esperado" ||
    v === "consumibles"
  );
}

// ─── Bloques de proveedor reutilizables ─────────────────────────────────────────

function ProviderCards({
  items,
  accent,
}: {
  items: ProviderStat[];
  accent: string;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {items.map((it) => (
        <div
          key={it.provider}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-center"
        >
          <p className="text-xs font-medium text-[var(--color-muted)] truncate">
            {it.provider}
          </p>
          <p className="text-lg font-semibold" style={{ color: accent }}>
            {it.count}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {formatKg(it.weightKg)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Pestañas ────────────────────────────────────────────────────────────────

async function ProduccionTab(): Promise<React.JSX.Element> {
  const stats = await getProductionStats();
  const chartData = [
    { label: "Prod. Term.", value: stats.pt.count },
    { label: "Subprod.", value: stats.subproducto.count },
    { label: "Rechazo", value: stats.rechazo.count },
  ];
  const hasProviders =
    stats.byProvider.pt.length +
      stats.byProvider.subproducto.length +
      stats.byProvider.rechazo.length >
    0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Producto Terminado"
          value={stats.pt.count}
          hint={formatKg(stats.pt.weightKg)}
          accent="var(--color-primary)"
        />
        <StatCard
          label="Subproducto"
          value={stats.subproducto.count}
          hint={formatKg(stats.subproducto.weightKg)}
          accent="#f59e0b"
        />
        <StatCard
          label="Rechazo"
          value={stats.rechazo.count}
          hint={formatKg(stats.rechazo.weightKg)}
          accent="#ef4444"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Producción por Tipo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MiniBarChart
            data={chartData}
            colors={["#2563eb", "#f59e0b", "#ef4444"]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="w-4 h-4" /> Desglose por Proveedor de Origen
          </CardTitle>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Producción según el proveedor del material de entrada (aproximado al
            proveedor mayoritario de cada lote).
          </p>
        </CardHeader>
        <CardContent>
          {!hasProviders ? (
            <p className="text-sm text-[var(--color-muted)] py-4 text-center">
              Sin datos de producción con proveedor asignado.
            </p>
          ) : (
            <div className="space-y-4">
              {stats.byProvider.pt.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Package className="w-4 h-4" /> Producto Terminado por
                    Proveedor
                  </h4>
                  <ProviderCards
                    items={stats.byProvider.pt}
                    accent="var(--color-primary)"
                  />
                </div>
              )}
              {stats.byProvider.subproducto.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Recycle className="w-4 h-4" /> Subproductos por Proveedor
                  </h4>
                  <ProviderCards
                    items={stats.byProvider.subproducto}
                    accent="#f59e0b"
                  />
                </div>
              )}
              {stats.byProvider.rechazo.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" /> Rechazos por Proveedor
                  </h4>
                  <ProviderCards
                    items={stats.byProvider.rechazo}
                    accent="#ef4444"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico Semanal de Producción</CardTitle>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Últimas 5 semanas
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Semana</TH>
                <TH className="text-center">Prod. Term.</TH>
                <TH className="text-center">Subprod.</TH>
                <TH className="text-center">Rechazo</TH>
                <TH className="text-center">Total</TH>
                <TH className="text-right">Peso</TH>
                <TH>Por Proveedor</TH>
              </TR>
            </THead>
            <TBody>
              {stats.weekly.map((w) => (
                <TR
                  key={w.label}
                  className={
                    w.isCurrent ? "bg-[var(--color-surface-hover)]" : ""
                  }
                >
                  <TD>
                    <p className="font-medium">{w.label}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {w.range}
                    </p>
                  </TD>
                  <TD className="text-center">{w.pt}</TD>
                  <TD className="text-center">{w.subproducto}</TD>
                  <TD className="text-center">{w.rechazo}</TD>
                  <TD className="text-center font-semibold">{w.total}</TD>
                  <TD className="text-right">{formatKg(w.weightKg)}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {w.byProvider.slice(0, 3).map((p) => (
                        <span
                          key={p.provider}
                          className="text-xs bg-[var(--color-surface-hover)] px-2 py-0.5 rounded"
                        >
                          {p.provider}: {p.count}
                        </span>
                      ))}
                      {w.byProvider.length > 3 && (
                        <span className="text-xs text-[var(--color-muted)]">
                          +{w.byProvider.length - 3} más
                        </span>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function ConsumidoTab(): Promise<React.JSX.Element> {
  const stats = await getConsumptionStats();
  const chartData = stats.byProvider.map((p) => ({
    label: p.provider,
    value: p.count,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4" /> Sacas Consumidas por Proveedor
            de Material
          </CardTitle>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Material de entrada procesado en producción
          </p>
        </CardHeader>
        <CardContent>
          {stats.byProvider.length === 0 ? (
            <EmptyState icon={TrendingDown} title="Sin datos de consumo" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <MiniBarChart data={chartData} colors={PROVIDER_COLORS} />
              <Table>
                <THead>
                  <TR>
                    <TH>Proveedor Material</TH>
                    <TH className="text-right">Sacas</TH>
                    <TH className="text-right">Peso</TH>
                  </TR>
                </THead>
                <TBody>
                  {stats.byProvider.map((p) => (
                    <TR key={p.provider}>
                      <TD className="font-medium">{p.provider}</TD>
                      <TD className="text-right">{p.count}</TD>
                      <TD className="text-right">{formatKg(p.weightKg)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico Semanal de Consumo</CardTitle>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Últimas 5 semanas
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Semana</TH>
                <TH className="text-center">Sacas</TH>
                <TH className="text-right">Peso</TH>
                <TH>Detalle por Proveedor</TH>
              </TR>
            </THead>
            <TBody>
              {stats.weekly.map((w) => (
                <TR
                  key={w.label}
                  className={
                    w.isCurrent ? "bg-[var(--color-surface-hover)]" : ""
                  }
                >
                  <TD>
                    <p className="font-medium">{w.label}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {w.range}
                    </p>
                  </TD>
                  <TD className="text-center font-semibold">{w.count}</TD>
                  <TD className="text-right">{formatKg(w.weightKg)}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {w.byProvider.slice(0, 4).map((p) => (
                        <span
                          key={p.provider}
                          className="text-xs bg-[var(--color-surface-hover)] px-2 py-0.5 rounded"
                        >
                          {p.provider}: {p.count}
                        </span>
                      ))}
                      {w.byProvider.length > 4 && (
                        <span className="text-xs text-[var(--color-muted)]">
                          +{w.byProvider.length - 4} más
                        </span>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function UbicacionTab(): Promise<React.JSX.Element> {
  const providers = await getLocationStats();
  if (providers.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="Sin datos de ubicación"
        description="No hay sacas en almacén para desglosar por proveedor."
      />
    );
  }
  return (
    <div className="space-y-4">
      {providers.map((p, idx) => (
        <Card key={p.provider}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span
                className="px-2.5 py-1 rounded text-white text-sm font-semibold"
                style={{
                  backgroundColor:
                    PROVIDER_COLORS[idx % PROVIDER_COLORS.length],
                }}
              >
                {p.provider}
              </span>
              <span className="text-lg font-semibold">
                {p.totalCount} sacas
              </span>
              <span className="text-sm text-[var(--color-muted)]">
                ({formatKg(p.totalWeightKg)})
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {p.warehouses.map((w) => (
                <div
                  key={w.warehouse}
                  className="rounded-lg bg-[var(--color-surface-hover)] p-2.5 text-center"
                >
                  <p className="text-xs text-[var(--color-muted)]">
                    {w.warehouse}
                  </p>
                  <p className="font-semibold">{w.count}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {formatKg(w.weightKg)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function EsperadoTab(): Promise<React.JSX.Element> {
  const { totals, byProvider } = await getExpectedStock();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Stock Actual"
          value={`${totals.currentCount} sacas`}
          hint={formatKg(totals.currentWeightKg)}
          accent="var(--color-primary)"
        />
        <StatCard
          label="En Tránsito"
          value={`${totals.transitCount} sacas`}
          hint={formatKg(totals.transitWeightKg)}
          accent="#f59e0b"
        />
        <StatCard
          label="Comprado (no enviado)"
          value={`${totals.purchasedCount} sacas`}
          hint={formatKg(totals.purchasedWeightKg)}
          accent="#8b5cf6"
        />
        <StatCard
          label="Stock Proyectado"
          value={`${totals.totalCount} sacas`}
          hint={formatKg(totals.totalWeightKg)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="w-4 h-4" /> Stock Esperado por Proveedor de
            Material
          </CardTitle>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Stock actual + en tránsito + comprado pendiente de envío (1 saca ≈ 1
            tonelada donde se aproxima).
          </p>
        </CardHeader>
        <CardContent>
          {byProvider.length === 0 ? (
            <EmptyState icon={Warehouse} title="Sin datos de stock esperado" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Proveedor Material</TH>
                  <TH className="text-right">Stock Actual</TH>
                  <TH className="text-right">En Tránsito</TH>
                  <TH className="text-right">Comprado</TH>
                  <TH className="text-right">Total Proyectado</TH>
                  <TH className="text-right">Peso Total</TH>
                </TR>
              </THead>
              <TBody>
                {byProvider.map((p) => (
                  <TR key={p.provider}>
                    <TD className="font-medium">{p.provider}</TD>
                    <TD className="text-right">{p.currentCount}</TD>
                    <TD className="text-right">{p.transitCount}</TD>
                    <TD className="text-right">{p.purchasedCount}</TD>
                    <TD className="text-right font-semibold">{p.totalCount}</TD>
                    <TD className="text-right">{formatKg(p.totalWeightKg)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function ConsumiblesTab(): Promise<React.JSX.Element> {
  const { stock, weekly } = await getConsumablesStats();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Palés"
          value={stock.pales.current}
          hint={`Mín: ${stock.pales.minimum}`}
          accent="#f59e0b"
        />
        <StatCard
          label="Capuchones"
          value={stock.capuchones.current}
          hint={`Mín: ${stock.capuchones.minimum}`}
          accent="#0ea5e9"
        />
        <StatCard
          label="Sacas vacías"
          value={stock.sacas.current}
          hint={`Mín: ${stock.sacas.minimum}`}
          accent="#8b5cf6"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> Consumo Semanal de Consumibles
          </CardTitle>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Salidas de las últimas 5 semanas
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Semana</TH>
                <TH>Período</TH>
                <TH className="text-right">Palés</TH>
                <TH className="text-right">Capuchones</TH>
                <TH className="text-right">Sacas</TH>
              </TR>
            </THead>
            <TBody>
              {weekly.map((w) => (
                <TR
                  key={w.label}
                  className={
                    w.isCurrent ? "bg-[var(--color-surface-hover)]" : ""
                  }
                >
                  <TD className="font-medium">{w.label}</TD>
                  <TD className="text-xs text-[var(--color-muted)]">
                    {w.range}
                  </TD>
                  <TD className="text-right">{w.pales}</TD>
                  <TD className="text-right">{w.capuchones}</TD>
                  <TD className="text-right">{w.sacas}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}): Promise<React.JSX.Element> {
  const { tab } = await searchParams;
  const activeTab: Tab = isTab(tab) ? tab : "produccion";

  return (
    <div>
      <PageHeader
        title="Inventario"
        description="Analítica de producción, consumo, ubicación y stock esperado de materiales."
      />

      {/* Pestañas */}
      <div className="flex items-center gap-1.5 mb-6 border-b border-[var(--color-border)] overflow-x-auto">
        {TABS.map((t) => {
          const active = t.value === activeTab;
          const Icon = t.icon;
          return (
            <Link
              key={t.value}
              href={`/inventario?tab=${t.value}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                active
                  ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "produccion" && <ProduccionTab />}
      {activeTab === "consumido" && <ConsumidoTab />}
      {activeTab === "ubicacion" && <UbicacionTab />}
      {activeTab === "esperado" && <EsperadoTab />}
      {activeTab === "consumibles" && <ConsumiblesTab />}
    </div>
  );
}
