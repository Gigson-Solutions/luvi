import { Package, Recycle, Trash2, ChevronDown } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatKg, formatDate } from "@/lib/utils";
import { MAX_SACKS_PER_LOT } from "@/lib/services/production.service";
import type {
  AvailableOutputLot,
  AvailableOutputLots,
  LotCosts,
} from "@/lib/services/shipment.service";

const eur = (n: number): string => `${n.toFixed(2)}€`;

/** Las 4 cajas de coste del lote (Material / Procesado / Consumibles / Total). */
function CostBoxes({ costs }: { costs: LotCosts }): React.JSX.Element {
  return (
    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <div className="rounded border border-yellow-300 bg-white/70 px-2 py-1">
        <p className="text-slate-500">Material</p>
        <p className="font-bold text-slate-800">{eur(costs.material)}</p>
      </div>
      <div className="rounded border border-yellow-300 bg-white/70 px-2 py-1">
        <p className="text-slate-500">Procesado</p>
        <p className="font-bold text-slate-800">{eur(costs.processing)}</p>
      </div>
      <div className="rounded border border-yellow-300 bg-white/70 px-2 py-1">
        <p className="text-slate-500">Consumibles</p>
        <p className="font-bold text-slate-800">{eur(costs.consumable)}</p>
      </div>
      <div className="rounded border border-yellow-400 bg-yellow-200 px-2 py-1">
        <p className="text-yellow-700">Total Lote</p>
        <p className="font-bold text-yellow-900">{eur(costs.total)}</p>
      </div>
    </div>
  );
}

/** GL-36 — Tarjeta del lote abierto: barra de progreso n/22 + desglose de coste. */
function OpenLotCard({ lot }: { lot: AvailableOutputLot }): React.JSX.Element {
  const pct = Math.min(100, (lot.sackCount / MAX_SACKS_PER_LOT) * 100);
  return (
    <Card className="border-2 border-yellow-400 bg-yellow-50/50 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-5 h-5 text-yellow-600" />
        <h3 className="text-base font-semibold text-[var(--color-foreground)] truncate">
          Lote Abierto: {lot.lotNumber}
        </h3>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 rounded-full bg-yellow-200 overflow-hidden">
          <div
            className="h-full bg-yellow-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-bold text-yellow-700 whitespace-nowrap">
          {lot.sackCount}/{MAX_SACKS_PER_LOT}
        </span>
      </div>
      <p className="text-xs text-yellow-700 mt-1">
        {formatKg(lot.availableKg)} total · {lot.materialName}
      </p>
      <CostBoxes costs={lot.costs} />
    </Card>
  );
}

/** Badge de estado del lote (Abierto / Listo para enviar). */
function LotStateBadge({
  lot,
}: {
  lot: AvailableOutputLot;
}): React.JSX.Element {
  if (lot.isOpen) {
    return (
      <span className="inline-flex items-center rounded-md bg-yellow-100 px-1.5 py-0.5 text-[11px] font-medium text-yellow-700">
        Abierto ({lot.sackCount}/{MAX_SACKS_PER_LOT})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
      Listo para enviar
    </span>
  );
}

/** Un lote de salida como fila colapsable (native <details>, sin JS). */
function LotRow({ lot }: { lot: AvailableOutputLot }): React.JSX.Element {
  const borderClass = lot.isOpen
    ? "border-yellow-300 bg-yellow-50/40"
    : "border-blue-200 bg-blue-50/40";
  return (
    <details className={`group rounded-xl border ${borderClass}`}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 list-none">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-[var(--color-foreground)] truncate">
              {lot.lotNumber}
            </p>
            <LotStateBadge lot={lot} />
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {lot.sackCount} {lot.sackCount === 1 ? "saca" : "sacas"} ·{" "}
            {formatKg(lot.availableKg)} · {lot.materialName} ·{" "}
            {formatDate(lot.producedAt, true)}
          </p>
          {lot.costs.total > 0 && (
            <p className="text-xs font-semibold text-green-700 mt-0.5">
              Coste total: {eur(lot.costs.total)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge tone="blue">{formatKg(lot.availableKg)}</Badge>
          <ChevronDown className="w-4 h-4 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t border-[var(--color-border)] p-3">
        {lot.costs.total > 0 && <CostBoxes costs={lot.costs} />}
        <Table>
          <THead>
            <TR>
              <TH>QR</TH>
              <TH>Material</TH>
              <TH className="text-right">Peso</TH>
            </TR>
          </THead>
          <TBody>
            {lot.sacks.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-xs">{s.qrCode}</TD>
                <TD>{s.materialName}</TD>
                <TD className="text-right">{formatKg(s.weight)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </details>
  );
}

/** Tabla plana de sacas disponibles (Subproductos / Rechazos). */
function SackTable({
  lots,
}: {
  lots: AvailableOutputLot[];
}): React.JSX.Element {
  return (
    <Table>
      <THead>
        <TR>
          <TH>QR</TH>
          <TH>Material</TH>
          <TH>Lote</TH>
          <TH className="text-right">Peso</TH>
        </TR>
      </THead>
      <TBody>
        {lots.flatMap((lot) =>
          lot.sacks.map((s) => (
            <TR key={s.id}>
              <TD className="font-mono text-xs">{s.qrCode}</TD>
              <TD>{s.materialName}</TD>
              <TD className="text-[var(--color-muted)]">{lot.lotNumber}</TD>
              <TD className="text-right">{formatKg(s.weight)}</TD>
            </TR>
          )),
        )}
      </TBody>
    </Table>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
}): React.JSX.Element {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)] mb-3">
      <Icon className="w-4 h-4 text-[var(--color-muted)]" />
      {title}
      <span className="text-[var(--color-muted)] font-normal">{count}</span>
    </h2>
  );
}

/** Panel "Lotes de Salida": Producto Terminado, Subproductos y Rechazos. */
export function OutputLotsPanel({
  lots,
}: {
  lots: AvailableOutputLots;
}): React.JSX.Element {
  const { productoTerminado, subproducto, rechazo } = lots;
  const openLot = productoTerminado.find((l) => l.isOpen);
  const subproductoSacks = subproducto.reduce(
    (n, l) => n + l.availableSacks,
    0,
  );
  const rechazoSacks = rechazo.reduce((n, l) => n + l.availableSacks, 0);

  return (
    <div className="space-y-8">
      {/* Producto Terminado */}
      <section>
        <SectionHeading
          icon={Package}
          title="Lotes Producto Terminado"
          count={productoTerminado.length}
        />
        {/* GL-36: lote abierto en curso, arriba y destacado */}
        {openLot && <OpenLotCard lot={openLot} />}

        {productoTerminado.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No hay lotes de Producto Terminado disponibles"
            description="Las sacas de Producto Terminado se agrupan en lotes de 22 en Producción y aparecen aquí, listas para expedir."
          />
        ) : (
          <div className="space-y-2">
            {productoTerminado.map((lot) => (
              <LotRow key={lot.id} lot={lot} />
            ))}
          </div>
        )}
      </section>

      {/* Subproductos */}
      <section>
        <SectionHeading
          icon={Recycle}
          title="Subproductos"
          count={subproductoSacks}
        />
        {subproducto.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--color-muted)]">
            Sin subproductos disponibles.
          </Card>
        ) : (
          <SackTable lots={subproducto} />
        )}
      </section>

      {/* Rechazos */}
      <section>
        <SectionHeading icon={Trash2} title="Rechazos" count={rechazoSacks} />
        {rechazo.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--color-muted)]">
            Sin rechazos disponibles.
          </Card>
        ) : (
          <SackTable lots={rechazo} />
        )}
      </section>
    </div>
  );
}
