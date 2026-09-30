import { FileSpreadsheet } from "lucide-react";

/**
 * Descarga el Excel del módulo con los filtros que tiene la página ahora mismo.
 * `query` son los parámetros de URL de la página (sin `?`).
 */
export function ExportButton({
  module,
  query,
}: {
  module: string;
  query?: URLSearchParams | string;
}): React.JSX.Element {
  const qs = query ? query.toString() : "";
  return (
    <a
      href={`/api/export/${module}${qs ? `?${qs}` : ""}`}
      download
      className="inline-flex h-9.5 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1"
    >
      <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
    </a>
  );
}
