import { PageHeader } from "@/components/layout/page-header";

export default function AlmacenPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Almacén"
        description="Zonas, sacas, ocupación actual y proyección."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 3 del plan de desarrollo.
      </p>
    </div>
  );
}
