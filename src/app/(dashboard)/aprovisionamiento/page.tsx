import Link from "next/link";
import { Package, Ship, Anchor, Factory, ChevronDown } from "lucide-react";
import { PurchaseOrderStatus } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PurchaseOrderStatusBadge } from "@/components/ui/status-badge";
import { formatKg, formatDate, cn } from "@/lib/utils";
import {
  listPurchaseOrdersPivot,
  getProcurementStats,
  getProcurementFormData,
  shipmentStage,
  type PurchaseOrderPivot,
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

const STAGE_BORDERS: Record<TransitStage, string> = {
  MARITIMO: "border-l-sky-400",
  VALENCIA: "border-l-blue-500",
  PLANTA: "border-l-green-500",
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

/** Chip compacto pedido / enviado / recibido / pendiente. */
function TonChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p
        className="text-sm font-semibold"
        style={accent ? { color: accent } : undefined}
      >
        {tons(value)}
      </p>
    </div>
  );
}

/** Tarjeta de un envío dentro del desplegable de la orden. */
function ShipmentCard({
  shipment,
}: {
  shipment: PurchaseOrderPivot["order"]["providerShipments"][number];
}): React.JSX.Element {
  const stage = shipmentStage(shipment);
  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 border-[var(--color-border)] bg-[var(--color-surface)] p-3",
        STAGE_BORDERS[stage],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-[var(--color-foreground)]">
              {shipment.billOfLading ?? "Envío"}
            </p>
            <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {shipment.containers.length}{" "}
            {shipment.containers.length === 1 ? "contenedor" : "contenedores"}
            {shipment.weightKg ? ` · ${formatKg(shipment.weightKg)}` : ""}
          </p>
          {shipment.containers.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {shipment.containers.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-muted)]"
                  title={c.billOfLading ? `BL ${c.billOfLading}` : undefined}
                >
                  {c.reference}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right text-xs space-y-0.5">
          {shipment.departureDate && (
            <p>
              <span className="text-[var(--color-muted)]">Salida: </span>
              {formatDate(shipment.departureDate)}
            </p>
          )}
          <p>
            <span className="text-[var(--color-muted)]">ETA Valencia: </span>
            {shipment.arrivedValencia ? (
              <span className="inline-flex items-center gap-1">
                <Anchor className="w-3 h-3 text-green-600" />
                {formatDate(shipment.arrivedValencia)}
              </span>
            ) : shipment.etaValencia ? (
              formatDate(shipment.etaValencia)
            ) : (
              "—"
            )}
          </p>
          <p className="font-medium">
            <span className="font-normal text-[var(--color-muted)]">
              ETA Planta:{" "}
            </span>
            {shipment.arrivedPlanta ? (
              <span className="inline-flex items-center gap-1">
                <Factory className="w-3 h-3 text-green-600" />
                {formatDate(shipment.arrivedPlanta)}
              </span>
            ) : shipment.etaPlanta ? (
              formatDate(shipment.etaPlanta)
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        {stage === "MARITIMO" && (
          <TransitMilestoneButton
            shipmentId={shipment.id}
            milestone="valencia"
          />
        )}
        {stage === "VALENCIA" && (
          <TransitMilestoneButton shipmentId={shipment.id} milestone="planta" />
        )}
        {stage === "PLANTA" && (
          <span className="text-xs text-[var(--color-muted)]">Completado</span>
        )}
      </div>
    </div>
  );
}

/** Orden de compra como fila desplegable con sus envíos (native <details>). */
function OrderRow({ p }: { p: PurchaseOrderPivot }): React.JSX.Element {
  const { order } = p;
  return (
    <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 list-none">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-[var(--color-foreground)] truncate">
              {order.poNumber}
            </p>
            <PurchaseOrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {order.supplier.name} · {p.materialName ?? "Sin material"}
            {order.originPort ? ` · ${order.originPort}` : ""} ·{" "}
            {p.shipmentCount === 1 ? "1 envío" : `${p.shipmentCount} envíos`}
            {p.nextEtaPlanta ? ` · ETA ${formatDate(p.nextEtaPlanta)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="text-[var(--color-muted)]">
              Pedido{" "}
              <span className="font-medium text-[var(--color-foreground)]">
                {tons(p.orderedTons)}
              </span>
            </span>
            <span className="text-[var(--color-muted)]">
              Recibido{" "}
              <span className="font-medium text-green-700">
                {tons(p.receivedTons)}
              </span>
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-[var(--color-border)] p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <TonChip label="Pedido" value={p.orderedTons} />
          <TonChip
            label="Enviado"
            value={p.sentTons}
            accent="var(--color-primary)"
          />
          <TonChip label="Recibido" value={p.receivedTons} accent="#15803d" />
          <TonChip
            label="Pendiente"
            value={p.pendingTons}
            accent="var(--color-warning)"
          />
        </div>

        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
            <Ship className="w-4 h-4 text-[var(--color-muted)]" />
            Envíos del pedido
          </h4>
          <NewShipmentDialog
            purchaseOrderId={order.id}
            poNumber={order.poNumber}
          />
        </div>

        {order.providerShipments.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Sin envíos registrados. Crea el primer envío para generar sus
            contenedores en Recepciones.
          </p>
        ) : (
          <div className="space-y-2">
            {order.providerShipments.map((s) => (
              <ShipmentCard key={s.id} shipment={s} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export default async function AprovisionamientoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<React.JSX.Element> {
  const { status } = await searchParams;
  const filter = isPurchaseOrderStatus(status) ? status : undefined;

  const [pivot, stats, formData] = await Promise.all([
    listPurchaseOrdersPivot(filter),
    getProcurementStats(),
    getProcurementFormData(),
  ]);

  return (
    <div>
      <PageHeader
        title="Aprovisionamiento"
        description="Órdenes de compra, tránsito marítimo y tracking de llegadas de materia prima."
        actions={
          <NewPurchaseOrderDialog
            suppliers={formData.suppliers}
            materials={formData.materials}
          />
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

      {/* Lista de órdenes de compra con sus envíos desplegables */}
      {pivot.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No hay órdenes de compra"
          description="Crea una orden de compra para empezar a planificar el aprovisionamiento de materia prima."
        />
      ) : (
        <div className="space-y-2">
          {pivot.map((p) => (
            <OrderRow key={p.order.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
