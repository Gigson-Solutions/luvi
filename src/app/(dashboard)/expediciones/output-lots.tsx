import { Package, Recycle, Trash2, ChevronDown } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatKg, formatDate } from "@/lib/utils";
import type {
  AvailableOutputLot,
  AvailableOutputLots,
} from "@/lib/services/shipment.service";

/** Un lote de salida como fila colapsable (native <details>, sin JS). */
function LotRow({ lot }: { lot: AvailableOutputLot }): React.JSX.Element {
  return (
    <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 list-none">
        <div className="min-w-0">
          <p className="font-medium text-[var(--color-foreground)] truncate">
            {lot.lotNumber}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {lot.materialName} · {formatDate(lot.producedAt, true)}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge tone="blue">{formatKg(lot.availableKg)}</Badge>
          <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">
            {lot.availableSacks} {lot.availableSacks === 1 ? "saca" : "sacas"}
          </span>
          <ChevronDown className="w-4 h-4 text-[var(--color-muted)] transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t border-[var(--color-border)] p-3">
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
          title="Producto Terminado"
          count={productoTerminado.length}
        />
        {productoTerminado.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No hay lotes de Producto Terminado disponibles"
            description="Las sacas de Producto Terminado registradas en Producción aparecerán aquí, listas para expedir."
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
