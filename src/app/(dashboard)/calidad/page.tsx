import { PageHeader } from "@/components/layout/page-header";

export default function CalidadPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Calidad"
        description="Registros de calidad por lote. Promedios por proveedor."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 8 del plan de desarrollo.
      </p>
    </div>
  );
}
