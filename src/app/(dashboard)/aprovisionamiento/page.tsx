import { Package, Ship, Anchor, Factory } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PurchaseOrderStatusBadge } from "@/components/ui/status-badge";
import { formatKg, formatDate } from "@/lib/utils";
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

function tons(n: number): string {
  return `${n.toFixed(2)} TM`;
}

export default async function AprovisionamientoPage(): Promise<React.JSX.Element> {
  const [pivot, shipments, stats, formData] = await Promise.all([
    listPurchaseOrdersPivot(),
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

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <StatCard
          label="Toneladas en tránsito"
          value={tons(stats.tonsInTransit)}
          hint="Envíos aún no llegados a planta"
          accent="var(--color-primary)"
        />
        <StatCard
          label="Pedidos abiertos"
          value={stats.openOrders}
          hint="Órdenes sin completar ni cancelar"
        />
      </section>

      {/* Vista pivot por orden de compra */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Órdenes de compra
          <span className="ml-2 text-[var(--color-muted)] font-normal">
            {pivot.length}
          </span>
        </h2>
        {pivot.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No hay órdenes de compra"
            description="Crea una orden de compra para empezar a planificar las importaciones."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nº PO</TH>
                <TH>Proveedor</TH>
                <TH>Material</TH>
                <TH>Estado</TH>
                <TH className="text-right">Pedidas</TH>
                <TH className="text-right">Enviadas</TH>
                <TH className="text-right">Recibidas</TH>
                <TH className="text-right">Envíos</TH>
              </TR>
            </THead>
            <TBody>
              {pivot.map((p) => (
                <TR key={p.order.id}>
                  <TD className="font-medium">{p.order.poNumber}</TD>
                  <TD>{p.order.supplier.name}</TD>
                  <TD>{p.materialName ?? "—"}</TD>
                  <TD>
                    <PurchaseOrderStatusBadge status={p.order.status} />
                  </TD>
                  <TD className="text-right">{tons(p.orderedTons)}</TD>
                  <TD className="text-right">{tons(p.sentTons)}</TD>
                  <TD className="text-right">{tons(p.receivedTons)}</TD>
                  <TD className="text-right">{p.shipmentCount}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Tracking de tránsito */}
      <section>
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
                <TH>Orden / BL</TH>
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
