import Link from "next/link";
import { Package, Ship, Anchor, Factory } from "lucide-react";
import { PurchaseOrderStatus } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PurchaseOrderStatusBadge } from "@/components/ui/status-badge";
import { formatKg, formatDate, cn } from "@/lib/utils";
import {
  listPurchaseOrdersPivot,
  listShipments,
  getProcurementStats,
  getProcurementFormData,
  shipmentStage,
  type TransitStage,
} from "@/lib/services/procurement.service";
import {
  NewPurchaseOrderDialog,
  NewShipmentDialog,
  TransitMilestoneButton,
} from "./procurement-dialogs";

const STAGE_LABELS: Record<TransitStage, string> = {
  MARITIMO: "En tránsito marítimo",
  VALENCIA: "Llegado a Valencia",
  PLANTA: "Llegado a planta",
};

const STAGE_TONES: Record<TransitStage, "sky" | "blue" | "green"> = {
  MARITIMO: "sky",
  VALENCIA: "blue",
  PLANTA: "green",
};

const FILTERS: { value: PurchaseOrderStatus | "TODOS"; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "ABIERTA", label: "Abierta" },
  { value: "EN_TRANSITO", label: "En tránsito" },
  { value: "RECIBIDA_PARCIAL", label: "Recibida parcial" },
  { value: "COMPLETADA", label: "Completada" },
  { value: "CANCELADA", label: "Cancelada" },
];

function isPurchaseOrderStatus(
  v: string | undefined,
): v is PurchaseOrderStatus {
  return (
    v === "ABIERTA" ||
    v === "EN_TRANSITO" ||
    v === "RECIBIDA_PARCIAL" ||
    v === "COMPLETADA" ||
    v === "CANCELADA"
  );
}

function tons(n: number): string {
  return `${n.toFixed(2)} TM`;
}

export default async function AprovisionamientoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<React.JSX.Element> {
  const { status } = await searchParams;
  const filter = isPurchaseOrderStatus(status) ? status : undefined;

  const [pivot, shipments, stats, formData] = await Promise.all([
    listPurchaseOrdersPivot(filter),
    listShipments(),
    getProcurementStats(),
    getProcurementFormData(),
  ]);

  return (
    <div>
      <PageHeader
        title="Aprovisionamiento"
        description="Órdenes de compra, tránsito marítimo y tracking de llegadas de materia prima."
        actions={
          <div className="flex gap-2">
            <NewShipmentDialog openOrders={formData.openOrders} />
            <NewPurchaseOrderDialog
              suppliers={formData.suppliers}
              materials={formData.materials}
            />
          </div>
        }
      />

      {/* StatCards: desglose de pedidos por estado + toneladas en tránsito */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Abierta" value={stats.byStatus.ABIERTA} />
        <StatCard
          label="En tránsito"
          value={stats.byStatus.EN_TRANSITO}
          accent="var(--color-primary)"
        />
        <StatCard
          label="Recibida parcial"
          value={stats.byStatus.RECIBIDA_PARCIAL}
          accent="var(--color-warning)"
        />
        <StatCard label="Completada" value={stats.byStatus.COMPLETADA} />
        <StatCard label="Cancelada" value={stats.byStatus.CANCELADA} />
        <StatCard
          label="En tránsito (t)"
          value={tons(stats.tonsInTransit)}
          accent="var(--color-primary)"
        />
      </div>

      {/* Filtro por estado */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => {
          const active = (f.value === "TODOS" && !filter) || f.value === filter;
          const href =
            f.value === "TODOS"
              ? "/aprovisionamiento"
              : `/aprovisionamiento?status=${f.value}`;
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

      {/* Tabla maestra de órdenes de compra */}
      {pivot.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No hay órdenes de compra"
          description="Crea una orden de compra para empezar a planificar el aprovisionamiento de materia prima."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Pedido</TH>
              <TH>Proveedor</TH>
              <TH>Origen material</TH>
              <TH className="text-right">Pedido (t)</TH>
              <TH className="text-right">Enviado (t)</TH>
              <TH className="text-right">Recibido (t)</TH>
              <TH className="text-right">Pendiente (t)</TH>
              <TH>Estado</TH>
              <TH>ETA</TH>
              <TH className="text-right">Acción</TH>
            </TR>
          </THead>
          <TBody>
            {pivot.map((p) => (
              <TR key={p.order.id}>
                <TD className="font-medium">{p.order.poNumber}</TD>
                <TD>{p.order.supplier.name}</TD>
                <TD>{p.materialName ?? "—"}</TD>
                <TD className="text-right">{tons(p.orderedTons)}</TD>
                <TD className="text-right">{tons(p.sentTons)}</TD>
                <TD className="text-right">{tons(p.receivedTons)}</TD>
                <TD className="text-right">{tons(p.pendingTons)}</TD>
                <TD>
                  <PurchaseOrderStatusBadge status={p.order.status} />
                </TD>
                <TD>
                  {p.nextEtaPlanta ? (
                    formatDate(p.nextEtaPlanta)
                  ) : (
                    <span className="text-[var(--color-muted)]">—</span>
                  )}
                </TD>
                <TD className="text-right">
                  <span className="text-xs text-[var(--color-muted)]">
                    {p.shipmentCount === 1
                      ? "1 envío"
                      : `${p.shipmentCount} envíos`}
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Tracking de envíos (detalle por envío) */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Tracking de envíos
          <span className="ml-2 text-[var(--color-muted)] font-normal">
            {shipments.length}
          </span>
        </h2>
        {shipments.length === 0 ? (
          <EmptyState
            icon={Ship}
            title="No hay envíos registrados"
            description="Registra un envío asociado a una orden de compra para hacer seguimiento del tránsito."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Pedido / BL</TH>
                <TH>Proveedor</TH>
                <TH>Origen / Barco</TH>
                <TH>Etapa</TH>
                <TH className="text-right">Peso</TH>
                <TH>ETA Valencia</TH>
                <TH>ETA Planta</TH>
                <TH className="text-right">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {shipments.map((s) => {
                const stage = shipmentStage(s);
                return (
                  <TR key={s.id}>
                    <TD className="font-medium">
                      {s.purchaseOrder?.poNumber ?? "—"}
                      {s.billOfLading && (
                        <span className="block text-xs font-normal text-[var(--color-muted)]">
                          {s.billOfLading}
                        </span>
                      )}
                    </TD>
                    <TD>{s.purchaseOrder?.supplier.name ?? "—"}</TD>
                    <TD>
                      {s.origin ?? "—"}
                      {s.vessel && (
                        <span className="block text-xs text-[var(--color-muted)]">
                          {s.vessel}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={STAGE_TONES[stage]}>
                        {STAGE_LABELS[stage]}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      {s.weightKg ? formatKg(s.weightKg) : "—"}
                    </TD>
                    <TD>
                      {s.arrivedValencia ? (
                        <span className="inline-flex items-center gap-1 text-[var(--color-foreground)]">
                          <Anchor className="w-3.5 h-3.5 text-green-600" />
                          {formatDate(s.arrivedValencia)}
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">
                          {s.etaValencia ? formatDate(s.etaValencia) : "—"}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {s.arrivedPlanta ? (
                        <span className="inline-flex items-center gap-1 text-[var(--color-foreground)]">
                          <Factory className="w-3.5 h-3.5 text-green-600" />
                          {formatDate(s.arrivedPlanta)}
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">
                          {s.etaPlanta ? formatDate(s.etaPlanta) : "—"}
                        </span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {stage === "MARITIMO" && (
                        <TransitMilestoneButton
                          shipmentId={s.id}
                          milestone="valencia"
                        />
                      )}
                      {stage === "VALENCIA" && (
                        <TransitMilestoneButton
                          shipmentId={s.id}
                          milestone="planta"
                        />
                      )}
                      {stage === "PLANTA" && (
                        <span className="text-xs text-[var(--color-muted)]">
                          Completado
                        </span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
