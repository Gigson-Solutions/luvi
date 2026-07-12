import { Factory, Package, PackageCheck, PackageX } from "lucide-react";
import { LotType } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { SackStatusBadge } from "@/components/ui/status-badge";
import { formatKg, formatDate } from "@/lib/utils";
import {
  listWarehouseSacks,
  listTodayOutput,
  getProductionStats,
  getProductionFormData,
  type OutputSack,
} from "@/lib/services/production.service";
import { HopperEntry, OutputSackDialog } from "./production-client";

const GROUP_META: Record<LotType, { title: string; icon: React.ElementType }> =
  {
    PRODUCTO_TERMINADO: { title: "Producto Terminado", icon: PackageCheck },
    SUBPRODUCTO: { title: "Subproducto", icon: Package },
    RECHAZO: { title: "Rechazo", icon: PackageX },
  };

const GROUP_ORDER: LotType[] = [
  LotType.PRODUCTO_TERMINADO,
  LotType.SUBPRODUCTO,
  LotType.RECHAZO,
];

function lotTypeOf(sack: OutputSack): LotType {
  return sack.lot?.type ?? LotType.PRODUCTO_TERMINADO;
}

export default async function ProduccionPage(): Promise<React.JSX.Element> {
  const [sacks, output, stats, formData] = await Promise.all([
    listWarehouseSacks(),
    listTodayOutput(),
    getProductionStats(),
    getProductionFormData(),
  ]);

  const grouped = GROUP_ORDER.map((type) => {
    const items = output.filter((s) => lotTypeOf(s) === type);
    const totalKg = items.reduce((sum, s) => sum + s.weight, 0);
    return { type, items, totalKg };
  });

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Sacas en producción"
          value={stats.inProduction}
          hint="En tolva ahora mismo"
          accent="#7c3aed"
        />
        <StatCard
          label="PT del día"
          value={stats.ptToday}
          hint="Sacas de Producto Terminado hoy"
          accent="#16a34a"
        />
        <StatCard
          label="Kg procesados"
          value={formatKg(stats.kgProcessed)}
          hint="Entradas a tolva hoy"
        />
      </div>

      {/* Entrada a tolva */}
      <section className="mb-8">
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

      {/* Historial del día */}
      <section>
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Producción de hoy
        </h2>
        {output.length === 0 ? (
          <EmptyState
            icon={Factory}
            title="Todavía no hay sacas de salida hoy"
            description="Registra una saca de salida (Producto Terminado, Subproducto o Rechazo)."
          />
        ) : (
          <div className="space-y-6">
            {grouped
              .filter((g) => g.items.length > 0)
              .map((g) => {
                const meta = GROUP_META[g.type];
                const Icon = meta.icon;
                return (
                  <div key={g.type}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-[var(--color-muted)]" />
                        <h3 className="text-sm font-medium text-[var(--color-foreground)]">
                          {meta.title}
                        </h3>
                        <span className="text-xs text-[var(--color-muted)]">
                          {g.items.length} sacas
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-[var(--color-foreground)]">
                        {formatKg(g.totalKg)}
                      </span>
                    </div>
                    <Table>
                      <THead>
                        <TR>
                          <TH>QR</TH>
                          <TH>Lote</TH>
                          <TH>Material</TH>
                          <TH>Peso</TH>
                          <TH>Estado</TH>
                          <TH>Hora</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {g.items.map((s) => (
                          <TR key={s.id}>
                            <TD className="font-medium">{s.qrCode}</TD>
                            <TD>{s.lot?.lotNumber ?? "—"}</TD>
                            <TD>{s.material.name}</TD>
                            <TD>{formatKg(s.weight)}</TD>
                            <TD>
                              <SackStatusBadge status={s.status} />
                            </TD>
                            <TD>{formatDate(s.createdAt, true)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
