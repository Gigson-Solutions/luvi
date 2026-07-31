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
  getLooseOutputSacks,
  type AvailableOutputLot,
} from "@/lib/services/shipment.service";
import {
  NewShipmentDialog,
  ExpediteShipmentButton,
  DeliverShipmentButton,
  AssignLotButton,
  UnassignLotButton,
  type AssignableLot,
} from "./shipment-dialogs";
import { OutputLotsPanel } from "./output-lots";

type Tab = "lotes" | "envios";

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: "lotes", label: "Lotes de Salida", icon: Package },
  { value: "envios", label: "Envíos", icon: Truck },
];

const FILTERS: { value: ShipmentStatus | "TODOS"; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "BORRADOR", label: "Pendiente" },
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

/** Aplana los lotes disponibles (todos los tipos) para el diálogo de asignación. */
function toAssignable(lot: AvailableOutputLot): AssignableLot {
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    type: lot.type,
    materialName: lot.materialName,
    availableKg: lot.availableKg,
    sackCount: lot.sackCount,
    isOpen: lot.isOpen,
  };
}

export default async function ExpedicionesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string }>;
}): Promise<React.JSX.Element> {
  const { status, tab } = await searchParams;
  const filter = isShipmentStatus(status) ? status : undefined;
  const activeTab: Tab = tab === "envios" ? "envios" : "lotes";

  const [shipments, stats, formData, outputLots, looseSacks] =
    await Promise.all([
      listShipments(filter),
      getShipmentStats(),
      getShipmentFormData(),
      getAvailableOutputLots(),
      getLooseOutputSacks(),
    ]);

  // Lotes sin asignar (abiertos o cerrados) candidatos a asignar a un envío.
  // Se permite enviar un lote parcial (<22): al expedir se cierra (isOpen=false).
  const assignableLots: AssignableLot[] = [
    ...outputLots.productoTerminado,
    ...outputLots.subproducto,
    ...outputLots.rechazo,
  ].map(toAssignable);

  return (
    <div>
      <PageHeader
        title="Expediciones"
        description="Envíos, expedición y generación de albaranes en Holded. La app es la única fuente de verdad."
        actions={
          <NewShipmentDialog
            buyers={formData.buyers}
            carriers={formData.carriers}
          />
        }
      />

      {/* StatCards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard label="Pendientes" value={stats.byStatus.BORRADOR} />
        <StatCard
          label="Expedido"
          value={stats.byStatus.EXPEDIDO}
          accent="var(--color-primary)"
        />
        <StatCard label="Entregado" value={stats.byStatus.ENTREGADO} />
        <StatCard
          label="Lotes disponibles"
          value={assignableLots.length}
          accent="var(--color-warning)"
        />
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
        <OutputLotsPanel lots={outputLots} loose={looseSacks} />
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
              description="Crea un envío y asígnale lotes de salida para expedir a un comprador."
            />
          ) : (
            <div className="space-y-3">
              {shipments.map((s) => {
                const totalKg = s.lots.reduce((sum, l) => sum + l.weightKg, 0);
                const date = s.deliveredAt ?? s.expeditedAt ?? s.createdAt;
                const isDraft = s.status === ShipmentStatus.BORRADOR;
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-[var(--color-foreground)]">
                            {s.reference}
                          </p>
                          <ShipmentStatusBadge status={s.status} />
                        </div>
                        <p className="text-xs text-[var(--color-muted)] mt-0.5">
                          {s.buyer.name}
                          {s.carrier ? ` · ${s.carrier.name}` : ""} ·{" "}
                          {s.lots.length}{" "}
                          {s.lots.length === 1 ? "lote" : "lotes"} ·{" "}
                          {formatKg(totalKg)} · {formatDate(date, true)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isDraft && (
                          <AssignLotButton
                            shipmentId={s.id}
                            lots={assignableLots}
                          />
                        )}
                        {isDraft && (
                          <ExpediteShipmentButton
                            shipmentId={s.id}
                            disabled={s.lots.length === 0}
                          />
                        )}
                        {s.status === ShipmentStatus.EXPEDIDO && (
                          <DeliverShipmentButton shipmentId={s.id} />
                        )}
                        {s.status === ShipmentStatus.ENTREGADO &&
                          s.holdedAlbaranId && (
                            <span className="text-xs text-[var(--color-muted)]">
                              Albarán {s.holdedAlbaranId}
                            </span>
                          )}
                      </div>
                    </div>

                    {/* Lotes asignados */}
                    {s.lots.length > 0 && (
                      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                        <Table>
                          <THead>
                            <TR>
                              <TH>Lote</TH>
                              <TH>Material</TH>
                              <TH className="text-right">Peso</TH>
                              {isDraft && (
                                <TH className="text-right">Acción</TH>
                              )}
                            </TR>
                          </THead>
                          <TBody>
                            {s.lots.map((l) => (
                              <TR key={l.id}>
                                <TD className="font-mono text-xs">
                                  {l.lot.lotNumber}
                                </TD>
                                <TD>{l.lot.material.name}</TD>
                                <TD className="text-right">
                                  {formatKg(l.weightKg)}
                                </TD>
                                {isDraft && (
                                  <TD className="text-right">
                                    <UnassignLotButton
                                      shipmentId={s.id}
                                      lotId={l.lotId}
                                    />
                                  </TD>
                                )}
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
