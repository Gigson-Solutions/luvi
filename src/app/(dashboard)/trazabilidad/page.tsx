import { Search, PackageSearch, Euro } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { traceSack } from "@/lib/services/traceability.service";
import { getFinalSackCost, type SackCost } from "@/lib/services/cost.service";
import { formatKg } from "@/lib/utils";
import { TraceSearch } from "./trace-search";
import { TraceChain } from "./trace-chain";

export default async function TrazabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const trace = query ? await traceSack(query) : null;
  const cost =
    trace && trace.sack.isOutput ? await getFinalSackCost(trace.sack.id) : null;

  return (
    <div>
      <PageHeader
        title="Trazabilidad"
        description="Sigue el recorrido de una saca hacia atrás (origen) y hacia adelante (destino) por QR o ID."
      />

      <div className="max-w-xl mb-8">
        <TraceSearch initialQuery={query} />
      </div>

      {trace ? (
        <div className="space-y-8">
          {cost && <CostCard cost={cost} />}
          <TraceChain trace={trace} />
        </div>
      ) : query ? (
        <EmptyState
          icon={PackageSearch}
          title="No se encontró ninguna saca"
          description={`No hay ninguna saca con QR o ID «${query}». Revisa el código e inténtalo de nuevo.`}
        />
      ) : (
        <EmptyState
          icon={Search}
          title="Busca una saca para trazarla"
          description="Escanea el QR o introduce el código de la saca para ver su cadena de trazabilidad completa."
        />
      )}
    </div>
  );
}

/** Coste por tonelada de la saca de salida (derivado del precio de compra). */
function CostCard({ cost }: { cost: SackCost }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center gap-1.5 mb-3">
        <Euro className="w-4 h-4 text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
          Coste de la saca (lote final)
        </h3>
      </div>
      {cost.hasPrice ? (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
                Precio / tonelada
              </dt>
              <dd className="text-lg font-semibold text-[var(--color-foreground)] mt-0.5">
                {cost.pricePerTon.toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                €/t
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
                Coste de esta saca
              </dt>
              <dd className="text-lg font-semibold text-[var(--color-foreground)] mt-0.5">
                {cost.sackCost.toLocaleString("es-ES", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                €
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
                Peso saca
              </dt>
              <dd className="text-sm text-[var(--color-foreground)] mt-1.5">
                {formatKg(cost.sackWeightKg)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
                Entrada con precio
              </dt>
              <dd className="text-sm text-[var(--color-foreground)] mt-1.5">
                {cost.pricedInputPct}%
              </dd>
            </div>
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
    </div>
  );
}
