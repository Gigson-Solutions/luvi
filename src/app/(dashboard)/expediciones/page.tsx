import { PageHeader } from "@/components/layout/page-header";

export default function ExpedicionesPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Expediciones"
        description="Envíos, pallets retornables, generación de albaranes en Holded."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 6 del plan de desarrollo.
      </p>
    </div>
  );
}
