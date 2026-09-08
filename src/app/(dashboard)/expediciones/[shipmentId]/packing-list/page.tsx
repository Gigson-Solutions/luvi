import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { getPackingList } from "@/lib/services/shipment.service";
import { requireModule } from "@/lib/rbac";
import { PrintButton } from "./print-button";

/** Peso en kg con 2 decimales y separador español. */
function kg(value: number): string {
  return `${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kg`;
}

/** Dato de cabecera del documento (etiqueta arriba, valor debajo). */
function HeaderField({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className="font-medium text-[var(--color-foreground)]">{value}</p>
    </div>
  );
}

/**
 * Packing list de un envío, con la presentación del documento que usa LUVI:
 * cabecera con nº de pedido, nº de albarán y fecha de carga, una fila por saca
 * (lote · BIG BAG · peso) y el peso total. Se imprime o se guarda como PDF.
 */
export default async function PackingListPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}): Promise<React.JSX.Element> {
  await requireModule("expediciones");
  const { shipmentId } = await params;
  const packingList = await getPackingList(shipmentId);
  if (!packingList) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/expediciones?tab=envios">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" /> Volver a Expediciones
          </Button>
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-[var(--color-border)] bg-white p-8 text-black print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between gap-6 border-b border-neutral-300 pb-4">
          <div>
            <h1 className="text-xl font-bold">PACKING LIST</h1>
            <p className="text-sm text-neutral-600">LUVI2000</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{packingList.buyerName}</p>
            {packingList.carrierName && (
              <p className="text-neutral-600">{packingList.carrierName}</p>
            )}
            {packingList.vehiclePlate && (
              <p className="text-neutral-600">{packingList.vehiclePlate}</p>
            )}
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <HeaderField
            label="Nº de pedido"
            value={packingList.orderNumber ?? "—"}
          />
          <HeaderField
            label="Nº albarán LUVI"
            value={packingList.albaranNumber}
          />
          <HeaderField
            label="Fecha de carga"
            value={formatDate(packingList.loadDate)}
          />
          <HeaderField label="Expedición" value={packingList.reference} />
        </section>

        {packingList.rows.length === 0 ? (
          <p className="text-sm text-neutral-600">
            Este envío todavía no tiene sacas asignadas.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-neutral-300 bg-neutral-100">
                <th className="px-2 py-2 text-left font-semibold">#</th>
                <th className="px-2 py-2 text-left font-semibold">Lote</th>
                <th className="px-2 py-2 text-left font-semibold">BIG BAG</th>
                <th className="px-2 py-2 text-left font-semibold">Producto</th>
                <th className="px-2 py-2 text-right font-semibold">Peso</th>
              </tr>
            </thead>
            <tbody>
              {packingList.rows.map((row, i) => (
                <tr key={row.qrCode} className="border-b border-neutral-200">
                  <td className="px-2 py-1.5 tabular-nums text-neutral-500">
                    {i + 1}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{row.lotNumber}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {row.sackNumber}
                    <span className="ml-2 text-xs text-neutral-500">
                      {row.qrCode}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{row.materialName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {kg(row.weightKg)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-400 font-semibold">
                <td className="px-2 py-2" colSpan={3}>
                  Total ({packingList.rows.length}{" "}
                  {packingList.rows.length === 1 ? "saca" : "sacas"})
                </td>
                <td />
                <td className="px-2 py-2 text-right tabular-nums">
                  {kg(packingList.totalWeightKg)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </article>
    </div>
  );
}
