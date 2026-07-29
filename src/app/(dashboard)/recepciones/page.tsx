import Link from "next/link";
import { Truck, Scale, Package } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { formatKg, formatDate, cn } from "@/lib/utils";
import {
  listPendingContainers,
  listReceivedContainers,
  getReceptionFormData,
} from "@/lib/services/reception.service";
import { NewReceptionDialog, ReceiveDialog } from "./reception-dialogs";

type Tab = "pendientes" | "pesados";

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: "pendientes", label: "Pendientes", icon: Scale },
  { value: "pesados", label: "Pesados", icon: Package },
];

export default async function RecepcionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; fecha?: string }>;
}): Promise<React.JSX.Element> {
  const { tab, q, fecha } = await searchParams;
  const activeTab: Tab = tab === "pesados" ? "pesados" : "pendientes";

  const [pending, received, formData] = await Promise.all([
    listPendingContainers({ q, fecha }),
    listReceivedContainers(),
    getReceptionFormData(),
  ]);

  // Conserva los filtros activos al cambiar de pestaña.
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (fecha) params.set("fecha", fecha);
  const tabHref = (t: Tab): string => {
    const p = new URLSearchParams(params);
    p.set("tab", t);
    return `/recepciones?${p.toString()}`;
  };

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

      {/* Filtros — buscador por referencia/contenedor + fecha de llegada.
          Server Component: se aplican vía GET (?q= / ?fecha=). */}
      <form
        method="get"
        className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6"
      >
        <input type="hidden" name="tab" value={activeTab} />
        <div className="flex-1">
          <label
            htmlFor="q"
            className="block text-xs text-[var(--color-muted)] mb-1"
          >
            Buscar por contenedor / referencia
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Referencia del contenedor…"
            className="w-full h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="fecha"
            className="block text-xs text-[var(--color-muted)] mb-1"
          >
            Fecha de llegada
          </label>
          <input
            id="fecha"
            name="fecha"
            type="date"
            defaultValue={fecha ?? ""}
            className="w-full h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-9 px-4 rounded-lg text-sm font-medium bg-[var(--color-primary)] text-white"
          >
            Filtrar
          </button>
          {(q || fecha) && (
            <Link
              href={`/recepciones?tab=${activeTab}`}
              className="h-9 px-4 inline-flex items-center rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]"
            >
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {/* Pestañas: Pendientes de recibir / Recibidos recientemente */}
      <div className="flex items-center gap-1.5 mb-6 border-b border-[var(--color-border)]">
        {TABS.map((t) => {
          const active = t.value === activeTab;
          const Icon = t.icon;
          const count =
            t.value === "pendientes" ? pending.length : received.length;
          return (
            <Link
              key={t.value}
              href={tabHref(t.value)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label} ({count})
            </Link>
          );
        })}
      </div>

      {activeTab === "pendientes" ? (
        /* Pendientes de recibir */
        pending.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No hay contenedores pendientes"
            description="Registra un contenedor para prepararlo antes de su llegada a planta."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Contenedor</TH>
                <TH>Proveedor</TH>
                <TH>Llegada prevista</TH>
                <TH>Est. (kg)</TH>
                <TH>Sacas est.</TH>
                {/* TODO: Tipo Saca requiere campo en el modelo (Container) */}
                <TH className="text-right">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {pending.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.reference}</TD>
                  <TD>{c.supplier.name}</TD>
                  <TD>
                    {c.estimatedArrival ? formatDate(c.estimatedArrival) : "—"}
                  </TD>
                  <TD>{c.expectedWeight ? formatKg(c.expectedWeight) : "—"}</TD>
                  <TD>{c.numSacks ?? "—"}</TD>
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
        )
      ) : /* Recibidos recientemente (Pesados) */
      received.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[var(--color-muted)]">
            Todavía no hay recepciones.
          </p>
        </Card>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Contenedor</TH>
              <TH>Proveedor</TH>
              <TH>Pesado</TH>
              {/* TODO: Bruto y Tara requieren campos en el modelo (Container solo
                  guarda actualWeight → peso neto). Se muestra solo Neto. */}
              <TH>Neto</TH>
              <TH>Sacas</TH>
              <TH>Origen peso</TH>
            </TR>
          </THead>
          <TBody>
            {received.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.reference}</TD>
                <TD>{c.supplier.name}</TD>
                <TD>{c.weighedAt ? formatDate(c.weighedAt, true) : "—"}</TD>
                <TD>{c.actualWeight ? formatKg(c.actualWeight) : "—"}</TD>
                <TD>{c.sacks.length}</TD>
                <TD>
                  <Badge
                    tone={c.weightSource === "gestruck" ? "green" : "neutral"}
                  >
                    {c.weightSource === "gestruck" ? "Gestruck" : "Manual"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
