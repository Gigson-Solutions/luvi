import { PageHeader } from "@/components/layout/page-header";

export default function TrazabilidadPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Trazabilidad"
        description="Forward y backward tracking por QR de saca."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 5 del plan de desarrollo.
      </p>
    </div>
  );
}
