import Link from "next/link";
import {
  Truck,
  Scale,
  Package,
  AlertTriangle,
  PackageCheck,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  getPanelStats,
  getProfitability,
} from "@/lib/services/dashboard.service";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtEuro(n: number): string {
  return `${n.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

function resolveDays(raw?: string): Period {
  const n = Number(raw);
  return n === 7 || n === 90 ? n : 30;
}

// ─── Tarjeta KPI clicable ──────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  href,
  alert,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  href: string;
  alert?: boolean;
}): React.JSX.Element {
  const danger = alert && value > 0;
  return (
    <Link href={href} className="block">
      <Card className="p-4 transition-colors hover:bg-[var(--color-surface-hover)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
              {title}
            </p>
            <p
              className="mt-1.5 text-2xl font-semibold"
              style={{
                color: danger
                  ? "var(--color-status-rechazo)"
                  : "var(--color-foreground)",
              }}
            >
              {value}
            </p>
          </div>
          <span
            className="rounded-lg p-2"
            style={{
              backgroundColor: danger
                ? "color-mix(in srgb, var(--color-status-rechazo) 12%, transparent)"
                : "var(--color-surface-hover)",
              color: danger
                ? "var(--color-status-rechazo)"
                : "var(--color-primary)",
            }}
          >
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────────

export default async function PanelPrincipalPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}): Promise<React.JSX.Element> {
  const { days: daysParam } = await searchParams;
  const days = resolveDays(daysParam);

  const [stats, profit] = await Promise.all([
    getPanelStats(),
    getProfitability(days),
  ]);

  const kpis: {
    title: string;
    value: number;
    icon: LucideIcon;
    href: string;
    alert?: boolean;
  }[] = [
    {
      title: "Camiones Hoy",
      value: stats.trucksToday,
      icon: Truck,
      href: "/recepciones",
    },
    {
      title: "Pendientes Pesaje",
      value: stats.pendingWeighing,
      icon: Scale,
      href: "/recepciones",
    },
    {
      title: "Sacas en Stock",
      value: stats.sacksInStock,
      icon: Package,
      href: "/almacen",
    },
    {
      title: "Incidencias Abiertas",
      value: stats.openIncidents,
      icon: AlertTriangle,
      href: "/incidencias",
      alert: true,
    },
    {
      title: "Envíos Pendientes",
      value: stats.pendingShipments,
      icon: PackageCheck,
      href: "/expediciones",
    },
    {
      title: "Alertas Consumibles",
      value: stats.consumableAlerts,
      icon: Boxes,
      href: "/consumibles",
      alert: true,
    },
  ];

  const quickActions: { label: string; href: string; icon: LucideIcon }[] = [
    { label: "Registrar contenedor", href: "/recepciones", icon: Truck },
    { label: "Ver almacén", href: "/almacen", icon: Package },
    {
      label: "Nueva Incidencia",
      href: "/incidencias",
      icon: AlertTriangle,
    },
    { label: "Crear Envío", href: "/expediciones", icon: PackageCheck },
  ];

  return (
    <div>
      <PageHeader
        title="Panel Principal"
        description="Resumen del estado actual de la planta."
      />

      {/* ─── KPIs clicables ─────────────────────────────────────────── */}
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k) => (
          <KpiCard key={k.title} {...k} />
        ))}
      </section>

      {/* ─── Acciones rápidas ───────────────────────────────────────── */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  className="flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-4 text-center transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]"
                >
                  <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                  <span className="text-sm font-medium text-[var(--color-foreground)]">
                    {a.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Rentabilidad ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Rentabilidad</CardTitle>
            <div className="flex items-center gap-1.5">
              {PERIODS.map((d) => {
                const active = d === days;
                return (
                  <Link
                    key={d}
                    href={`/dashboards?days=${d}`}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-[var(--color-primary)] text-white"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]",
                    )}
                  >
                    {d}d
                  </Link>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* KPIs de rentabilidad */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Inversión
              </p>
              <p
                className="mt-1.5 text-2xl font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {fmtEuro(profit.totalInvested)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {profit.shipmentsCount} envíos · {profit.totalQuantityTons}t
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                € / Tonelada
              </p>
              <p className="mt-1.5 text-2xl font-semibold">
                {fmtEuro(profit.avgCostPerTon)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Promedio compras
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Coste Lotes
              </p>
              <p className="mt-1.5 text-2xl font-semibold">
                {fmtEuro(profit.totalLotCost)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {profit.lotsCount} lotes
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Coste Medio Lote
              </p>
              <p className="mt-1.5 text-2xl font-semibold">
                {fmtEuro(profit.avgLotCost)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {profit.avgCostPerKg > 0
                  ? `${profit.avgCostPerKg.toFixed(3)} €/kg`
                  : "—"}
              </p>
            </Card>
          </div>

          {/* Ranking de proveedores */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
              Proveedores más rentables (€/t)
            </h4>
            {profit.byProvider.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-muted)]">
                Sin compras con precio en este periodo. Añade el precio de
                compra al registrar aprovisionamientos para ver el ranking.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Proveedor</TH>
                    <TH className="text-right">€/t</TH>
                    <TH className="hidden text-right sm:table-cell">
                      Toneladas
                    </TH>
                    <TH className="hidden text-right md:table-cell">
                      Inversión
                    </TH>
                    <TH className="hidden text-right md:table-cell">Envíos</TH>
                  </TR>
                </THead>
                <TBody>
                  {profit.byProvider.map((p, idx) => (
                    <TR key={p.name} className={idx === 0 ? "font-medium" : ""}>
                      <TD>
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                            idx === 0
                              ? "bg-[var(--color-primary)] text-white"
                              : "bg-[var(--color-surface-hover)] text-[var(--color-muted)]",
                          )}
                        >
                          {idx + 1}
                        </span>
                      </TD>
                      <TD className="font-medium">{p.name}</TD>
                      <TD
                        className="text-right font-semibold"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {fmtEuro(p.avgCostPerTon)}
                      </TD>
                      <TD className="hidden text-right sm:table-cell">
                        {p.totalQuantity}t
                      </TD>
                      <TD className="hidden text-right md:table-cell">
                        {fmtEuro(p.totalInvested)}
                      </TD>
                      <TD className="hidden text-right md:table-cell">
                        {p.shipments}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
