import { PageHeader } from "@/components/layout/page-header";

export default function IncidenciasPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Incidencias"
        description="Gestión de incidencias con fotos. Upload a Cloudflare R2."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 10 del plan de desarrollo.
      </p>
    </div>
  );
}
