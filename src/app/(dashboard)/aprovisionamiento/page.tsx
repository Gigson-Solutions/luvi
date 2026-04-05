import { PageHeader } from "@/components/layout/page-header";

export default function AprovisionamientoPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Aprovisionamiento"
        description="Órdenes de compra, tránsito marítimo, tracking de llegadas."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 7 del plan de desarrollo.
      </p>
    </div>
  );
}
