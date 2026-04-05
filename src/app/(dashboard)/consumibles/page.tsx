import { PageHeader } from "@/components/layout/page-header";

export default function ConsumiblesPage(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Consumibles"
        description="Stock de pallets, sacas vacías, capuchones. Pallets retornables por cliente."
      />
      <p className="text-[var(--color-muted)] text-sm mt-8">
        Módulo pendiente de implementar — Fase 9 del plan de desarrollo.
      </p>
    </div>
  );
}
