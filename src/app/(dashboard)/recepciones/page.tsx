import { PageHeader } from "@/components/layout/page-header";

export default function RecepcionesPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Recepciones"
        description="Registro de contenedores y camiones. Pesaje con Gestruck."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 2 del plan de desarrollo.
      </p>
    </div>
  );
}
