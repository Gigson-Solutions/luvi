import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { getPackingList } from "@/lib/services/shipment.service";
import { requireModule } from "@/lib/rbac";
import { PrintButton } from "./print-button";

/** Peso en kg sin decimales, como en el documento de LUVI. */
function kg(value: number): string {
  return String(Math.round(value));
}

const cell = "border px-3 py-1.5 text-left align-middle";
const head = "border px-3 py-2.5 text-center text-2xl font-bold";

/**
 * Bordes negros en línea: la regla global `* { border-color }` de globals.css
 * va sin capa y pisa a la utilidad `border-black` de Tailwind.
 */
const black: React.CSSProperties = { borderColor: "#000" };

/**
 * Packing list de un envío, calcado del documento que usa LUVI: logo, título,
 * nº de pedido, albarán LUVI con la fecha de carga, tabla LOTE · BIG BAG ·
 * PESO (kg) con una fila por saca y el peso total. Se imprime o se guarda como
 * PDF desde el navegador.
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
      <style>{"@page { size: A4; margin: 20mm 18mm; }"}</style>

      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/expediciones?tab=envios">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" /> Volver a Expediciones
          </Button>
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-[var(--color-border)] bg-white px-12 py-14 text-black print:rounded-none print:border-0 print:p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/luvi2000-logo.png"
          alt="luvi2000"
          width={200}
          height={60}
          className="mb-20 h-auto w-64"
        />

        <h1 className="mb-10 text-center text-lg font-bold text-[#2f5496] underline underline-offset-2">
          PACKING LIST
        </h1>

        <p className="mb-4 text-sm font-bold text-[#2f5496]">
          Nº de pedido {packingList.orderNumber ?? "—"}
        </p>
        <p className="mb-3 text-sm font-bold text-[#2f5496]">
          ALBARÁN LUVI: {packingList.albaranNumber} (FECHA DE CARGA:{" "}
          {formatDate(packingList.loadDate)})
        </p>

        <table className="w-full table-fixed border-collapse font-[Cambria,Georgia,serif] text-base leading-snug">
          <thead>
            <tr>
              <th className={head} style={black}>
                LOTE
              </th>
              <th className={head} style={black}>
                BIG BAG
              </th>
              <th className={head} style={black}>
                PESO (kg)
              </th>
            </tr>
          </thead>
          <tbody>
            {packingList.rows.length === 0 ? (
              <tr>
                <td className={cell} style={black} colSpan={3}>
                  Este envío todavía no tiene sacas asignadas.
                </td>
              </tr>
            ) : (
              packingList.rows.map((row) => (
                <tr key={row.qrCode} className="break-inside-avoid">
                  <td className={cell} style={black}>
                    {row.lotNumber}
                  </td>
                  <td className={cell} style={black}>
                    {row.sackNumber}
                  </td>
                  <td className={cell} style={black}>
                    {kg(row.weightKg)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className="mt-14 font-[Cambria,Georgia,serif] text-2xl font-bold">
          PESO TOTAL:&nbsp; {kg(packingList.totalWeightKg)} KG
        </p>
      </article>
    </div>
  );
}
