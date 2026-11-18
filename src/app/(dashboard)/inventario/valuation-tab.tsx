import { AlertTriangle, Euro, Package, Warehouse } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatCard,
} from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getInventoryValuation,
  listPriceGaps,
  type ValuationFilters,
} from "@/lib/services/valuation.service";
import { SupplierPriceForm } from "./supplier-price-form";

const fmtT = (n: number): string =>
  `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} t`;

const fmtEur = (n: number | null): string =>
  n == null
    ? "—"
    : `${n.toLocaleString("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} €`;

/** Pestaña Inventario → Valoración: materia prima en almacén a coste. */
export async function ValoracionTab({
  filters,
}: {
  filters: ValuationFilters;
}): Promise<React.JSX.Element> {
  const [valuation, gaps] = await Promise.all([
    getInventoryValuation(filters),
    listPriceGaps(),
  ]);

  if (valuation.categories.length === 0) {
    return (
      <EmptyState
        icon={Euro}
        title="Sin materia prima en almacén"
        description="No hay sacas de materia prima en almacén para valorar."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)]">
        Valor a coste de la materia prima en almacén. El precio medio de cada
        tipo es ponderado por toneladas y solo cuenta las sacas con precio: el
        de su embarque (mercancía + gastos) o, si no tienen pedido, el que fijes
        más abajo para su proveedor y producto.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Sacas" value={valuation.totals.sacks} icon={Package} />
        <StatCard
          label="Toneladas"
          value={fmtT(valuation.totals.tons)}
          icon={Warehouse}
        />
        <StatCard
          label="Valor total"
          value={fmtEur(valuation.totals.value)}
          icon={Euro}
        />
        <StatCard
          label="Sacas sin precio"
          value={valuation.totals.unpricedSacks}
          icon={AlertTriangle}
        />
      </div>

      {valuation.categories.map((c) => (
        <Card key={c.categoryId ?? "sin-tipo"}>
          <CardContent className="pt-5">
            <div className="flex items-baseline gap-x-6 gap-y-1 flex-wrap mb-3">
              <h3 className="text-base font-semibold">{c.category}</h3>
              <span className="text-sm">
                {c.sacks} sacas · {fmtT(c.tons)}
              </span>
              <span className="text-sm font-semibold">
                Precio medio ponderado:{" "}
                {c.avgPerTon == null
                  ? "sin precio"
                  : `${fmtEur(c.avgPerTon)}/t`}
              </span>
              <span className="text-sm">Valor: {fmtEur(c.value)}</span>
              {c.unpricedSacks > 0 && (
                <span className="text-xs text-amber-700">
                  {c.unpricedSacks} sacas sin precio (no entran en la media)
                </span>
              )}
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-[var(--color-primary)]">
                Desglose por proveedor
              </summary>
              <div className="mt-2">
                <Table>
                  <THead>
                    <TR>
                      <TH>Proveedor</TH>
                      <TH>Sacas</TH>
                      <TH>Toneladas</TH>
                      <TH>€/t medio</TH>
                      <TH>Valor</TH>
                      <TH>Sin precio</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {c.suppliers.map((s) => (
                      <TR key={s.supplierId ?? "sin-proveedor"}>
                        <TD>{s.supplier}</TD>
                        <TD>{s.sacks}</TD>
                        <TD>{fmtT(s.tons)}</TD>
                        <TD>{fmtEur(s.avgPerTon)}</TD>
                        <TD>{fmtEur(s.value)}</TD>
                        <TD>{s.unpricedSacks}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </details>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Precio del stock sin pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-muted)] mb-3">
            Las sacas dadas de alta a mano no tienen embarque. Indica aquí el
            €/t de cada proveedor y producto para que cuenten en la valoración.
          </p>
          {gaps.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              No hay sacas de alta manual con proveedor asignado. Asigna
              proveedor a las sacas desde Almacén para poder valorarlas.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Proveedor</TH>
                  <TH>Producto</TH>
                  <TH>Sacas</TH>
                  <TH>Toneladas</TH>
                  <TH>Precio €/t</TH>
                </TR>
              </THead>
              <TBody>
                {gaps.map((g) => (
                  <TR key={`${g.supplierId}|${g.materialId}`}>
                    <TD>{g.supplier}</TD>
                    <TD>{g.material}</TD>
                    <TD>{g.sacks}</TD>
                    <TD>{fmtT(g.tons)}</TD>
                    <TD>
                      <SupplierPriceForm
                        supplierId={g.supplierId}
                        materialId={g.materialId}
                        pricePerTon={g.pricePerTon}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
