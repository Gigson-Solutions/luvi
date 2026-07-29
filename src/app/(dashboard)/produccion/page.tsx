import Link from "next/link";
import { ArrowDownToLine, Package, PackageCheck, PackageX } from "lucide-react";
import { LotType } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatKg, formatDate, cn } from "@/lib/utils";
import {
  listWarehouseSacks,
  listOutputSacksByType,
  getOutputCounts,
  getProductionStats,
  getProductionFormData,
  type OutputSack,
  type SackWithMaterialZone,
} from "@/lib/services/production.service";
import { HopperEntry, OutputSackDialog } from "./production-client";

type Tab = "entrada" | "pt" | "subproducto" | "rechazo";

/** Pestañas de salida → tipo de lote. */
const TAB_TYPE: Record<Exclude<Tab, "entrada">, LotType> = {
  pt: LotType.PRODUCTO_TERMINADO,
  subproducto: LotType.SUBPRODUCTO,
  rechazo: LotType.RECHAZO,
};

const OUTPUT_META: Record<
  Exclude<Tab, "entrada">,
  { title: string; description: string; icon: React.ElementType }
> = {
  pt: {
    title: "Producto Terminado",
    description: "Sacas de Producto Terminado registradas.",
    icon: PackageCheck,
  },
  subproducto: {
    title: "Subproducto",
    description: "Sacas de subproducto registradas.",
    icon: Package,
  },
  rechazo: {
    title: "Rechazo",
    description: "Sacas de rechazo registradas.",
    icon: PackageX,
  },
};

function isTab(v: string | undefined): v is Tab {
  return (
    v === "entrada" || v === "pt" || v === "subproducto" || v === "rechazo"
  );
}

export default async function ProduccionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}): Promise<React.JSX.Element> {
  const { tab } = await searchParams;
  const activeTab: Tab = isTab(tab) ? tab : "entrada";

  const [stats, formData, counts, sacks, outputSacks] = await Promise.all([
    getProductionStats(),
    getProductionFormData(),
    getOutputCounts(),
    activeTab === "entrada"
      ? listWarehouseSacks()
      : Promise.resolve<SackWithMaterialZone[]>([]),
    activeTab === "entrada"
      ? Promise.resolve<OutputSack[]>([])
      : listOutputSacksByType(TAB_TYPE[activeTab]),
  ]);

  const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
    { value: "entrada", label: "Entrada", icon: ArrowDownToLine },
    {
      value: "pt",
      label: `Producto Terminado (${counts.PRODUCTO_TERMINADO})`,
      icon: PackageCheck,
    },
    {
      value: "subproducto",
      label: `Subproducto (${counts.SUBPRODUCTO})`,
      icon: Package,
    },
    {
      value: "rechazo",
      label: `Rechazo (${counts.RECHAZO})`,
      icon: PackageX,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Producción"
        description="Entrada a tolva, sacas de salida y lotes autogenerados."
        actions={
          <OutputSackDialog
            materials={formData.materials}
            zones={formData.zones}
          />
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard
          label="Sacas en producción"
          value={stats.inProduction}
          hint="En tolva ahora mismo"
          accent="#7c3aed"
        />
        <StatCard
          label="PT del día"
          value={stats.ptToday}
          hint="Producto Terminado hoy"
          accent="#16a34a"
        />
        <StatCard
          label="Subprod. del día"
          value={stats.subToday}
          hint="Subproductos hoy"
        />
        <StatCard
          label="Rechazos del día"
          value={stats.rechazoToday}
          hint="Rechazos hoy"
          accent="#dc2626"
        />
        <StatCard
          label="Kg procesados"
          value={formatKg(stats.kgProcessed)}
          hint="Entradas a tolva hoy"
        />
      </div>

      {/* Pestañas */}
      <div className="flex items-center gap-1.5 mb-6 border-b border-[var(--color-border)]">
        {TABS.map((t) => {
          const active = t.value === activeTab;
          const Icon = t.icon;
          return (
            <Link
              key={t.value}
              href={`/produccion?tab=${t.value}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "entrada" ? (
        <section>
          <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
            Entrada a tolva
            <span className="ml-2 text-[var(--color-muted)] font-normal">
              {sacks.length} en almacén
            </span>
          </h2>
          <HopperEntry
            sacks={sacks.map((s) => ({
              id: s.id,
              qrCode: s.qrCode,
              weight: s.weight,
              status: s.status,
              material: { name: s.material.name },
              zone: s.zone ? { name: s.zone.name } : null,
            }))}
          />
        </section>
      ) : (
        <OutputTab meta={OUTPUT_META[activeTab]} sacks={outputSacks} />
      )}
    </div>
  );
}

function OutputTab({
  meta,
  sacks,
}: {
  meta: { title: string; description: string; icon: React.ElementType };
  sacks: OutputSack[];
}): React.JSX.Element {
  const Icon = meta.icon;
  if (sacks.length === 0) {
    return (
      <EmptyState
        icon={Icon}
        title={`Todavía no hay sacas de ${meta.title.toLowerCase()}`}
        description="Crea una saca de salida con el botón «Saca de salida»."
      />
    );
  }

  const totalKg = sacks.reduce((sum, s) => sum + s.weight, 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--color-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
            {meta.title}
          </h2>
          <span className="text-xs text-[var(--color-muted)]">
            {sacks.length} sacas
          </span>
        </div>
        <span className="text-sm font-semibold text-[var(--color-foreground)]">
          {formatKg(totalKg)}
        </span>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>QR</TH>
            <TH>Material</TH>
            <TH>Peso</TH>
            <TH>Lote</TH>
            <TH>Fecha</TH>
          </TR>
        </THead>
        <TBody>
          {sacks.map((s) => (
            <TR key={s.id}>
              <TD className="font-medium">{s.qrCode}</TD>
              <TD>{s.material.name}</TD>
              <TD>{formatKg(s.weight)}</TD>
              <TD>{s.lot?.lotNumber ?? "—"}</TD>
              <TD>{formatDate(s.createdAt, true)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  );
}
