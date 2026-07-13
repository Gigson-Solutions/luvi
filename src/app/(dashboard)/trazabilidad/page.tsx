import { Search, PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { traceSack } from "@/lib/services/traceability.service";
import { TraceSearch } from "./trace-search";
import { TraceChain } from "./trace-chain";

export default async function TrazabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const trace = query ? await traceSack(query) : null;

  return (
    <div>
      <PageHeader
        title="Trazabilidad"
        description="Sigue el recorrido de una saca hacia atrás (origen) y hacia adelante (destino) por QR o ID."
      />

      <div className="max-w-xl mb-8">
        <TraceSearch initialQuery={query} />
      </div>

      {trace ? (
        <TraceChain trace={trace} />
      ) : query ? (
        <EmptyState
          icon={PackageSearch}
          title="No se encontró ninguna saca"
          description={`No hay ninguna saca con QR o ID «${query}». Revisa el código e inténtalo de nuevo.`}
        />
      ) : (
        <EmptyState
          icon={Search}
          title="Busca una saca para trazarla"
          description="Escanea el QR o introduce el código de la saca para ver su cadena de trazabilidad completa."
        />
      )}
    </div>
  );
}
