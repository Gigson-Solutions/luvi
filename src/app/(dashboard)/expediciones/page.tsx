import Link from "next/link";
import { Truck, Package } from "lucide-react";
import { ShipmentStatus } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/card";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { formatKg, formatDate, cn } from "@/lib/utils";
import {
  listShipments,
  getShipmentStats,
  getShipmentFormData,
  getAvailableOutputLots,
} from "@/lib/services/shipment.service";
import {
  NewShipmentDialog,
  ConfirmShipmentButton,
  ExpediteShipmentButton,
  DeliverShipmentButton,
} from "./shipment-dialogs";
import { OutputLotsPanel } from "./output-lots";

type Tab = "lotes" | "envios";

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: "lotes", label: "Lotes de Salida", icon: Package },
  { value: "envios", label: "Envíos", icon: Truck },
];

const FILTERS: { value: ShipmentStatus | "TODOS"; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "BORRADOR", label: "Borrador" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "EXPEDIDO", label: "Expedido" },
  { value: "ENTREGADO", label: "Entregado" },
];

function isShipmentStatus(v: string | undefined): v is ShipmentStatus {
  return (
    v === "BORRADOR" ||
    v === "CONFIRMADO" ||
    v === "EXPEDIDO" ||
    v === "ENTREGADO"
  );
}

export default async function ExpedicionesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string }>;
}): Promise<React.JSX.Element> {
  const { status, tab } = await searchParams;
  const filter = isShipmentStatus(status) ? status : undefined;
  const activeTab: Tab = tab === "envios" ? "envios" : "lotes";

  const [shipments, stats, formData, outputLots] = await Promise.all([
    listShipments(filter),
    getShipmentStats(),
    getShipmentFormData(),
    getAvailableOutputLots(),
  ]);

  return (
    <div>
      <PageHeader
        title="Expediciones"
        description="Envíos, expedición y generación de albaranes en Holded. La app es la única fuente de verdad."
        actions={
          <NewShipmentDialog
            buyers={formData.buyers}
            carriers={formData.carriers}
            lots={formData.lots}
          />
        }
      />

      {/* StatCards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard label="Borrador" value={stats.byStatus.BORRADOR} />
        <StatCard
          label="Confirmado"
          value={stats.byStatus.CONFIRMADO}
          accent="var(--color-warning)"
        />
        <StatCard
          label="Expedido"
          value={stats.byStatus.EXPEDIDO}
          accent="var(--color-primary)"
        />
        <StatCard label="Entregado" value={stats.byStatus.ENTREGADO} />
        <StatCard label="Kg expedidos" value={formatKg(stats.kgExpedited)} />
      </div>

      {/* Pestañas */}
      <div className="flex items-center gap-1.5 mb-6 border-b border-[var(--color-border)]">
        {TABS.map((t) => {
          const active = t.value === activeTab;
          const Icon = t.icon;
          return (
            <Link
              key={t.value}
              href={`/expediciones?tab=${t.value}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
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

      {activeTab === "lotes" ? (
        <OutputLotsPanel lots={outputLots} />
      ) : (
        <>
          {/* Filtro por estado */}
          <div className="flex items-center gap-1.5 mb-4">
            {FILTERS.map((f) => {
              const active =
                (f.value === "TODOS" && !filter) || f.value === filter;
              const href =
                f.value === "TODOS"
                  ? "/expediciones?tab=envios"
                  : `/expediciones?tab=envios&status=${f.value}`;
              return (
                <Link
                  key={f.value}
                  href={href}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]",
                  )}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>

          {shipments.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No hay envíos"
              description="Crea un envío para expedir lotes de Producto Terminado a un comprador."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Referencia</TH>
                  <TH>Estado</TH>
                  <TH>Comprador</TH>
                  <TH>Transportista</TH>
                  <TH>Lotes</TH>
                  <TH>Peso</TH>
                  <TH>Fecha</TH>
                  <TH className="text-right">Acción</TH>
                </TR>
              </THead>
              <TBody>
                {shipments.map((s) => {
                  const totalKg = s.lots.reduce(
                    (sum, l) => sum + l.weightKg,
                    0,
                  );
                  const date = s.deliveredAt ?? s.expeditedAt ?? s.createdAt;
                  return (
                    <TR key={s.id}>
                      <TD className="font-medium">{s.reference}</TD>
                      <TD>
                        <ShipmentStatusBadge status={s.status} />
                      </TD>
                      <TD>{s.buyer.name}</TD>
                      <TD>{s.carrier?.name ?? "—"}</TD>
                      <TD>{s.lots.length}</TD>
                      <TD>{formatKg(totalKg)}</TD>
                      <TD>{formatDate(date, true)}</TD>
                      <TD className="text-right">
                        {s.status === ShipmentStatus.BORRADOR && (
                          <ConfirmShipmentButton shipmentId={s.id} />
                        )}
                        {s.status === ShipmentStatus.CONFIRMADO && (
                          <ExpediteShipmentButton shipmentId={s.id} />
                        )}
                        {s.status === ShipmentStatus.EXPEDIDO && (
                          <DeliverShipmentButton shipmentId={s.id} />
                        )}
                        {s.status === ShipmentStatus.ENTREGADO && (
                          <span className="text-xs text-[var(--color-muted)]">
                            {s.holdedAlbaranId
                              ? `Albarán ${s.holdedAlbaranId}`
                              : "—"}
                          </span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
