import { PageHeader } from "@/components/layout/page-header";

export default function ProduccionPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Producción"
        description="Transformaciones, tolva, lotes autogenerados."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 4 del plan de desarrollo.
      </p>
    </div>
  );
}
