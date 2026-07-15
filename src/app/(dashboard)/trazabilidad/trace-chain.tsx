import Link from "next/link";
import {
  ChevronRight,
  Factory,
  Truck,
  Warehouse,
  Package,
  Building2,
  ShoppingCart,
  Layers,
  ArrowLeft,
  ArrowRight,
  Link2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SackStatusBadge } from "@/components/ui/status-badge";
import { formatKg, formatDate } from "@/lib/utils";
import type {
  SackTrace,
  TraceRelatedSack,
} from "@/lib/services/traceability.service";

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

/** Bloque de sacas navegables (padres / hijos / relacionadas). */
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
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
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
    </div>
  );
}

const LOT_TYPE_LABELS: Record<string, string> = {
  PRODUCTO_TERMINADO: "Producto terminado",
  SUBPRODUCTO: "Subproducto",
  RECHAZO: "Rechazo",
};

interface StepData {
  icon: React.ElementType;
  label: string;
  title: string;
  lines: string[];
  current?: boolean;
}

function Step({
  icon: Icon,
  label,
  title,
  lines,
  current,
}: StepData): React.JSX.Element {
  return (
    <div
      className={`shrink-0 w-52 rounded-xl border p-3.5 ${
        current
          ? "border-[var(--color-primary)] bg-[var(--color-surface)] ring-1 ring-[var(--color-primary)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4 text-[var(--color-muted)]" />
        <span className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className="text-sm font-semibold text-[var(--color-foreground)] truncate"
        title={title}
      >
        {title}
      </p>
      {lines.map((line, i) => (
        <p
          key={i}
          className="text-xs text-[var(--color-muted)] mt-0.5 truncate"
          title={line}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

/** Fila horizontal de pasos conectados con flechas. */
function Chain({ steps }: { steps: StepData[] }): React.JSX.Element {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-stretch gap-2 min-w-max">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <Step {...step} />
            {i < steps.length - 1 && (
              <ChevronRight className="w-5 h-5 shrink-0 text-[var(--color-muted)]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function sackStep(trace: SackTrace): StepData {
  const { sack } = trace;
  return {
    icon: Package,
    label: "Saca",
    title: sack.qrCode,
    lines: [
      `${sack.materialName} · ${formatKg(sack.weight)}`,
      sack.isOutput ? "Saca de salida" : "Saca de entrada",
    ],
    current: true,
  };
}

// ─── Cadena hacia atrás (origen) ────────────────────────────────────────────────

function buildOriginChain(trace: SackTrace): StepData[] {
  const steps: StepData[] = [];

  if (trace.sack.isOutput) {
    // Saca de salida: sacas de entrada → transformación → lote → saca.
    const inputs = trace.originTransformations.flatMap((t) => t.inputs);
    const suppliers = new Set(
      inputs
        .map((i) => i.container?.supplierName)
        .filter((n): n is string => Boolean(n)),
    );
    if (inputs.length > 0) {
      steps.push({
        icon: Building2,
        label: "Proveedores",
        title:
          suppliers.size === 1
            ? [...suppliers][0]
            : `${suppliers.size} proveedores`,
        lines: [`${inputs.length} sacas de entrada`],
      });
      steps.push({
        icon: Factory,
        label: "Transformación",
        title:
          trace.originTransformations.length === 1
            ? "1 transformación"
            : `${trace.originTransformations.length} transformaciones`,
        lines: [`${inputs.length} sacas consumidas`],
      });
    }
    if (trace.originLot) {
      steps.push({
        icon: Layers,
        label: "Lote",
        title: trace.originLot.lotNumber,
        lines: [
          LOT_TYPE_LABELS[trace.originLot.type] ?? trace.originLot.type,
          formatDate(trace.originLot.producedAt),
        ],
      });
    }
  } else if (trace.originContainer) {
    // Saca de entrada: proveedor → contenedor → saca.
    const c = trace.originContainer;
    steps.push({
      icon: Building2,
      label: "Proveedor",
      title: c.supplierName,
      lines: [c.supplierCode],
    });
    steps.push({
      icon: Truck,
      label: "Contenedor",
      title: c.reference,
      lines: [
        c.arrivedAt
          ? `Recibido ${formatDate(c.arrivedAt)}`
          : "Sin fecha de recepción",
      ],
    });
  }

  steps.push(sackStep(trace));
  return steps;
}

// ─── Cadena hacia adelante (destino) ────────────────────────────────────────────

function buildDestinationChain(trace: SackTrace): StepData[] {
  const steps: StepData[] = [sackStep(trace)];

  // Saca de entrada: lotes que alimentó.
  if (!trace.sack.isOutput && trace.producedLots.length > 0) {
    const lot = trace.producedLots[0];
    steps.push({
      icon: Layers,
      label: trace.producedLots.length > 1 ? "Lotes" : "Lote",
      title:
        trace.producedLots.length > 1
          ? `${trace.producedLots.length} lotes`
          : lot.lotNumber,
      lines:
        trace.producedLots.length > 1
          ? ["Producidos en planta"]
          : [LOT_TYPE_LABELS[lot.type] ?? lot.type, formatDate(lot.producedAt)],
    });
  }

  if (trace.shipments.length > 0) {
    const first = trace.shipments[0];
    const buyers = new Set(trace.shipments.map((s) => s.buyerName));
    steps.push({
      icon: Truck,
      label: trace.shipments.length > 1 ? "Envíos" : "Envío",
      title:
        trace.shipments.length > 1
          ? `${trace.shipments.length} envíos`
          : first.reference,
      lines:
        trace.shipments.length > 1
          ? [`vía ${first.via}`]
          : [
              `vía ${first.via}`,
              first.expeditedAt
                ? `Expedido ${formatDate(first.expeditedAt)}`
                : "Sin expedir",
            ],
    });
    steps.push({
      icon: ShoppingCart,
      label: buyers.size > 1 ? "Compradores" : "Comprador",
      title: buyers.size > 1 ? `${buyers.size} compradores` : first.buyerName,
      lines: buyers.size > 1 ? [] : [first.buyerCode],
    });
  }

  return steps;
}

// ─── Componente principal ───────────────────────────────────────────────────────

export function TraceChain({ trace }: { trace: SackTrace }): React.JSX.Element {
  const { sack } = trace;
  const originChain = buildOriginChain(trace);
  const destinationChain = buildDestinationChain(trace);
  const hasDestination =
    trace.shipments.length > 0 || trace.producedLots.length > 0;

  return (
    <div className="space-y-8">
      {/* Ficha de la saca */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
                {sack.qrCode}
              </h2>
              <SackStatusBadge status={sack.status} />
            </div>
            <p className="text-sm text-[var(--color-muted)] mt-1">
              {sack.isOutput ? "Saca de salida" : "Saca de entrada"} · Creada{" "}
              {formatDate(sack.createdAt)}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <div>
            <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
              Material
            </dt>
            <dd className="text-sm text-[var(--color-foreground)] mt-0.5">
              {sack.materialName}{" "}
              <span className="text-[var(--color-muted)]">
                ({sack.materialCode})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
              Peso
            </dt>
            <dd className="text-sm text-[var(--color-foreground)] mt-0.5">
              {formatKg(sack.weight)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
              Ubicación
            </dt>
            <dd className="text-sm text-[var(--color-foreground)] mt-0.5 flex items-center gap-1">
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
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
              Nº saca
            </dt>
            <dd className="text-sm text-[var(--color-foreground)] mt-0.5">
              {sack.batchNumber ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Cadena hacia atrás (origen) */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Origen (hacia atrás)
        </h3>
        <Chain steps={originChain} />
      </section>

      {/* Cadena hacia adelante (destino) */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Destino (hacia adelante)
        </h3>
        {hasDestination ? (
          <Chain steps={destinationChain} />
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            La saca todavía no se ha consumido en producción ni expedido.
          </p>
        )}
      </section>

      {/* Navegación por sacas: padres / hijos / relacionadas */}
      {(trace.parents.length > 0 ||
        trace.children.length > 0 ||
        trace.related.length > 0) && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
            Navegación por sacas
          </h3>
          <div className="grid gap-3 md:grid-cols-3">
            <NavGroup
              icon={ArrowLeft}
              label="Padres"
              hint="Sacas de entrada de las que proviene."
              sacks={trace.parents}
            />
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
        </section>
      )}

      {/* Detalle de sacas de entrada consumidas (solo sacas de salida) */}
      {trace.originTransformations.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
            Sacas de entrada consumidas
          </h3>
          <div className="space-y-4">
            {trace.originTransformations.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Factory className="w-4 h-4 text-[var(--color-muted)]" />
                  <span className="text-sm font-medium text-[var(--color-foreground)]">
                    Transformación
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {formatDate(t.startedAt, true)}
                    {t.endedAt ? ` → ${formatDate(t.endedAt, true)}` : ""}
                  </span>
                </div>
                <ul className="space-y-2">
                  {t.inputs.map((inp) => (
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
                          {inp.container.supplierName} ·{" "}
                          {inp.container.reference}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
