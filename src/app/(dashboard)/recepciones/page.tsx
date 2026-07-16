import { Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { formatKg, formatDate } from "@/lib/utils";
import {
  listPendingContainers,
  listReceivedContainers,
  getReceptionFormData,
} from "@/lib/services/reception.service";
import { NewReceptionDialog, ReceiveDialog } from "./reception-dialogs";

export default async function RecepcionesPage(): Promise<React.JSX.Element> {
  const [pending, received, formData] = await Promise.all([
    listPendingContainers(),
    listReceivedContainers(),
    getReceptionFormData(),
  ]);

  return (
    <div>
      <PageHeader
        title="Recepciones"
        description="Contenedores y camiones pendientes de recibir. Pesaje con Gestruck o manual."
        actions={
          <NewReceptionDialog
            suppliers={formData.suppliers}
            materials={formData.materials}
            zones={formData.zones}
            warehouses={formData.warehouses}
          />
        }
      />

      {/* Pendientes de recibir */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Pendientes de recibir
          <span className="ml-2 text-[var(--color-muted)] font-normal">
            {pending.length}
          </span>
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No hay contenedores pendientes"
            description="Registra un contenedor para prepararlo antes de su llegada a planta."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Referencia</TH>
                <TH>Proveedor</TH>
                <TH>Peso estimado</TH>
                <TH>Sacas est.</TH>
                <TH>Llegada prevista</TH>
                <TH className="text-right">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {pending.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.reference}</TD>
                  <TD>{c.supplier.name}</TD>
                  <TD>{c.expectedWeight ? formatKg(c.expectedWeight) : "—"}</TD>
                  <TD>{c.numSacks ?? "—"}</TD>
                  <TD>
                    {c.estimatedArrival ? formatDate(c.estimatedArrival) : "—"}
                  </TD>
                  <TD className="text-right">
                    <ReceiveDialog
                      containerId={c.id}
                      reference={c.reference}
                      materials={formData.materials}
                      zones={formData.zones}
                      defaultMaterialId={c.materialId}
                      estimatedSacks={c.numSacks}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Recibidos recientemente */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Recibidos recientemente
        </h2>
        {received.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-[var(--color-muted)]">
              Todavía no hay recepciones.
            </p>
          </Card>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Referencia</TH>
                <TH>Proveedor</TH>
                <TH>Peso real</TH>
                <TH>Sacas</TH>
                <TH>Origen peso</TH>
                <TH>Recibido</TH>
              </TR>
            </THead>
            <TBody>
              {received.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.reference}</TD>
                  <TD>{c.supplier.name}</TD>
                  <TD>{c.actualWeight ? formatKg(c.actualWeight) : "—"}</TD>
                  <TD>{c.sacks.length}</TD>
                  <TD>
                    <Badge
                      tone={c.weightSource === "gestruck" ? "green" : "neutral"}
                    >
                      {c.weightSource === "gestruck" ? "Gestruck" : "Manual"}
                    </Badge>
                  </TD>
                  <TD>{c.arrivedAt ? formatDate(c.arrivedAt, true) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
