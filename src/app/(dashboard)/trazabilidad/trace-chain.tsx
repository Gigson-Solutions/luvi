import Link from "next/link";
import {
  Factory,
  Truck,
  Warehouse,
  Package,
  ShoppingCart,
  Layers,
  ArrowLeft,
  ArrowRight,
  Link2,
  Euro,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SackStatusBadge,
  ShipmentStatusBadge,
} from "@/components/ui/status-badge";
import { formatKg, formatDate } from "@/lib/utils";
import type { SackCost } from "@/lib/services/cost.service";
import type {
  SackTrace,
  TraceRelatedSack,
  TraceContainer,
  TraceTransformation,
  TraceLot,
  TraceShipment,
} from "@/lib/services/traceability.service";

// ─── Estilos de bloque de color suave (verde / azul / ámbar) ─────────────────────
// Fondos de color por bloque con equivalente en dark (prefers-color-scheme).
// El contenido interior usa nuestros tokens var(--color-*) para foreground/muted.

type BlockTone = "green" | "blue" | "amber";

const BLOCK: Record<BlockTone, { wrap: string; head: string; icon: string }> = {
  green: {
    wrap: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30",
    head: "text-green-800 dark:text-green-300",
    icon: "text-green-700 dark:text-green-400",
  },
  blue: {
    wrap: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30",
    head: "text-blue-800 dark:text-blue-300",
    icon: "text-blue-700 dark:text-blue-400",
  },
  amber: {
    wrap: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
    head: "text-amber-800 dark:text-amber-300",
    icon: "text-amber-700 dark:text-amber-400",
  },
};

const LOT_TYPE_LABELS: Record<string, string> = {
  PRODUCTO_TERMINADO: "Producto terminado",
  SUBPRODUCTO: "Subproducto",
  RECHAZO: "Rechazo",
};

// ─── Primitivas de presentación ──────────────────────────────────────────────────

/** Bloque vertical de color con cabecera (icono + título + contador opcional). */
function ColorBlock({
  tone,
  icon: Icon,
  title,
  count,
  children,
}: {
  tone: BlockTone;
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const c = BLOCK[tone];
  return (
    <section className={`rounded-xl border p-5 ${c.wrap}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 shrink-0 ${c.icon}`} />
        <h3 className={`text-base font-semibold ${c.head}`}>{title}</h3>
        {count != null && (
          <span className={`text-sm ${c.head} opacity-70`}>({count})</span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Sub-tarjeta blanca (surface) sobre el fondo de color del bloque. */
function SubCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-[var(--color-foreground)] mt-0.5 flex items-center gap-1">
        {children}
      </dd>
    </div>
  );
}

/** Enlace navegable a la traza de otra saca (por su QR). */
function SackLink({ sack }: { sack: TraceRelatedSack }): React.JSX.Element {
  return (
    <Link
      href={`/trazabilidad?q=${encodeURIComponent(sack.qrCode)}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm hover:border-[var(--color-primary)] hover:ring-1 hover:ring-[var(--color-primary)] transition-colors"
      title={`Trazar ${sack.qrCode}`}
    >
      <Package className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
      <span className="font-medium text-[var(--color-foreground)]">
        {sack.qrCode}
      </span>
      <span className="text-[var(--color-muted)]">
        {sack.materialName} · {formatKg(sack.weight)}
      </span>
    </Link>
  );
}

/** Grupo de sacas navegables (padres / hijos / relacionadas). */
function NavGroup({
  icon: Icon,
  label,
  hint,
  sacks,
}: {
  icon: React.ElementType;
  label: string;
  hint: string;
  sacks: TraceRelatedSack[];
}): React.JSX.Element | null {
  if (sacks.length === 0) return null;
  return (
    <SubCard>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="text-sm font-semibold text-[var(--color-foreground)]">
          {label}
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          ({sacks.length})
        </span>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {sacks.map((s) => (
          <SackLink key={s.id} sack={s} />
        ))}
      </div>
    </SubCard>
  );
}

// ─── Piezas de datos reutilizables ───────────────────────────────────────────────

/** Contenedor de origen (proveedor + referencia + fechas). */
function ContainerCard({
  container,
}: {
  container: TraceContainer;
}): React.JSX.Element {
  return (
    <SubCard>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Truck className="w-4 h-4 text-[var(--color-muted)]" />
        <span className="text-sm font-medium text-[var(--color-foreground)]">
          Contenedor
        </span>
        <Badge tone="blue">{container.reference}</Badge>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Proveedor">
          {container.supplierName}{" "}
          <span className="text-[var(--color-muted)]">
            ({container.supplierCode})
          </span>
        </Field>
        <Field label="Referencia">{container.reference}</Field>
        <Field label="Recibido">
          {container.arrivedAt ? formatDate(container.arrivedAt) : "—"}
        </Field>
        <Field label="Registrado">
          {container.registeredAt ? formatDate(container.registeredAt) : "—"}
        </Field>
      </dl>
    </SubCard>
  );
}

/** Detalle de una transformación con sus sacas de entrada (clicables). */
function TransformationCard({
  tf,
}: {
  tf: TraceTransformation;
}): React.JSX.Element {
  return (
    <SubCard>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Factory className="w-4 h-4 text-[var(--color-muted)]" />
        <span className="text-sm font-medium text-[var(--color-foreground)]">
          Transformación
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          {formatDate(tf.startedAt, true)}
          {tf.endedAt ? ` → ${formatDate(tf.endedAt, true)}` : ""}
        </span>
      </div>
      <ul className="space-y-2">
        {tf.inputs.map((inp) => (
          <li
            key={inp.id}
            className="flex items-center gap-2 text-sm flex-wrap"
          >
            <Package className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
            <Link
              href={`/trazabilidad?q=${encodeURIComponent(inp.qrCode)}`}
              className="font-medium text-[var(--color-foreground)] hover:text-[var(--color-primary)] hover:underline"
              title={`Trazar ${inp.qrCode}`}
            >
              {inp.qrCode}
            </Link>
            <span className="text-[var(--color-muted)]">
              {inp.materialName} · {formatKg(inp.weight)}
            </span>
            {inp.container && (
              <Badge tone="blue">
                {inp.container.supplierName} · {inp.container.reference}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </SubCard>
  );
}

/** Lote (número + tipo + fecha de producción). */
function LotCard({ lot }: { lot: TraceLot }): React.JSX.Element {
  return (
    <SubCard>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Layers className="w-4 h-4 text-[var(--color-muted)]" />
        <span className="text-sm font-medium text-[var(--color-foreground)]">
          Lote
        </span>
        <Badge tone="green">{lot.lotNumber}</Badge>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Tipo">{LOT_TYPE_LABELS[lot.type] ?? lot.type}</Field>
        <Field label="Producido">{formatDate(lot.producedAt)}</Field>
      </dl>
    </SubCard>
  );
}

/** Envío (referencia + comprador + estado + fechas). */
function ShipmentCard({
  shipment,
}: {
  shipment: TraceShipment;
}): React.JSX.Element {
  return (
    <SubCard>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Truck className="w-4 h-4 text-[var(--color-muted)]" />
        <span className="text-sm font-medium text-[var(--color-foreground)]">
          {shipment.reference}
        </span>
        <ShipmentStatusBadge status={shipment.status} />
        <Badge tone="neutral">vía {shipment.via}</Badge>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Comprador">
          <ShoppingCart className="w-3.5 h-3.5 text-[var(--color-muted)]" />
          {shipment.buyerName}{" "}
          <span className="text-[var(--color-muted)]">
            ({shipment.buyerCode})
          </span>
        </Field>
        <Field label="Expedido">
          {shipment.expeditedAt ? formatDate(shipment.expeditedAt) : "—"}
        </Field>
        <Field label="Entregado">
          {shipment.deliveredAt ? formatDate(shipment.deliveredAt) : "—"}
        </Field>
      </dl>
    </SubCard>
  );
}

/** Coste €/t de la saca de salida (extra nuestro, integrado en el bloque Origen). */
function CostCard({ cost }: { cost: SackCost }): React.JSX.Element {
  return (
    <SubCard>
      <div className="flex items-center gap-1.5 mb-3">
        <Euro className="w-4 h-4 text-[var(--color-primary)]" />
        <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
          Coste de la saca (lote final)
        </h4>
      </div>
      {cost.hasPrice ? (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Precio / tonelada">
              {cost.pricePerTon.toLocaleString("es-ES", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              €/t
            </Field>
            <Field label="Coste de esta saca">
              {cost.sackCost.toLocaleString("es-ES", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              €
            </Field>
            <Field label="Peso saca">{formatKg(cost.sackWeightKg)}</Field>
            <Field label="Entrada con precio">{cost.pricedInputPct}%</Field>
          </dl>
          <p className="text-xs text-[var(--color-muted)] mt-3">
            Media ponderada del precio de compra ({cost.inputTons} TM de entrada
            → {cost.outputTons} TM de salida).
            {cost.pricedInputPct < 100 &&
              " Estimación parcial: parte de la entrada no tiene precio de compra registrado."}
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">
          Sin precio de compra en las órdenes de compra del material de entrada.
          Añádelo al crear el pedido en Aprovisionamiento para ver el coste.
        </p>
      )}
    </SubCard>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────────

export function TraceChain({
  trace,
  cost,
}: {
  trace: SackTrace;
  cost?: SackCost | null;
}): React.JSX.Element {
  const { sack } = trace;

  const hasOrigin = sack.isOutput
    ? trace.originTransformations.length > 0 ||
      trace.originLot != null ||
      trace.parents.length > 0
    : trace.originContainer != null;

  const hasDestination =
    trace.producedLots.length > 0 ||
    trace.shipments.length > 0 ||
    trace.children.length > 0 ||
    trace.related.length > 0;

  return (
    <div className="space-y-6">
      {/* ── BLOQUE 1 · Saca Consultada (verde) ── */}
      <ColorBlock tone="green" icon={Package} title="Saca Consultada">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            {sack.qrCode}
          </h2>
          <SackStatusBadge status={sack.status} />
          <span className="text-sm text-[var(--color-muted)]">
            {sack.isOutput ? "Saca de salida" : "Saca de entrada"} · Creada{" "}
            {formatDate(sack.createdAt)}
          </span>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Material">
            {sack.materialName}{" "}
            <span className="text-[var(--color-muted)]">
              ({sack.materialCode})
            </span>
          </Field>
          <Field label="Peso">{formatKg(sack.weight)}</Field>
          <Field label="Ubicación">
            {sack.zoneName ? (
              <>
                <Warehouse className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                {sack.zoneName}
                {sack.warehouseName && (
                  <span className="text-[var(--color-muted)]">
                    · {sack.warehouseName}
                  </span>
                )}
              </>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Nº saca">{sack.batchNumber ?? "—"}</Field>
        </dl>
      </ColorBlock>

      {/* ── BLOQUE 2 · Origen (azul) ── */}
      <ColorBlock tone="blue" icon={ArrowLeft} title="Origen">
        {hasOrigin ? (
          <div className="space-y-4">
            {sack.isOutput ? (
              <>
                {trace.originTransformations.map((tf) => (
                  <TransformationCard key={tf.id} tf={tf} />
                ))}
                {trace.originLot && <LotCard lot={trace.originLot} />}
                <NavGroup
                  icon={ArrowLeft}
                  label="Padres"
                  hint="Sacas de entrada de las que proviene esta saca."
                  sacks={trace.parents}
                />
                {cost && <CostCard cost={cost} />}
              </>
            ) : (
              trace.originContainer && (
                <ContainerCard container={trace.originContainer} />
              )
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Sin origen registrado para esta saca.
          </p>
        )}
      </ColorBlock>

      {/* ── BLOQUE 3 · Productos / Destino (ámbar) ── */}
      <ColorBlock tone="amber" icon={ArrowRight} title="Productos / Destino">
        {hasDestination ? (
          <div className="space-y-4">
            {trace.producedLots.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
                  Lotes producidos ({trace.producedLots.length})
                </p>
                {trace.producedLots.map((lot) => (
                  <LotCard key={lot.id} lot={lot} />
                ))}
              </div>
            )}
            {trace.shipments.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
                  Envíos ({trace.shipments.length})
                </p>
                {trace.shipments.map((s) => (
                  <ShipmentCard key={s.id} shipment={s} />
                ))}
              </div>
            )}
            <NavGroup
              icon={ArrowRight}
              label="Hijos"
              hint="Sacas finales en las que se transformó."
              sacks={trace.children}
            />
            <NavGroup
              icon={Link2}
              label="Relacionadas"
              hint="Hermanas del mismo lote o transformación."
              sacks={trace.related}
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            La saca todavía no se ha consumido en producción ni expedido.
          </p>
        )}
      </ColorBlock>
    </div>
  );
}
