import { PageHeader } from "@/components/layout/page-header";

export default function DashboardsPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Dashboards"
        description="5 dashboards KPI: General, Recepciones, Producción, Expediciones, Stock."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 11 del plan de desarrollo.
      </p>
    </div>
  );
}
