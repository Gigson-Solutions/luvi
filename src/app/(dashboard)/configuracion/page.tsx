import { PageHeader } from "@/components/layout/page-header";

export default function ConfiguracionPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Materiales, almacenes, zonas, umbrales de alerta."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar. Solo accesible para ADMIN.
      </p>
    </div>
  );
}
