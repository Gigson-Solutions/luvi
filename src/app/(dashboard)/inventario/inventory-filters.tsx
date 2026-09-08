"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InventoryFilterOptions } from "@/lib/services/inventory.service";

interface Option {
  id: string;
  name: string;
}

/** Un criterio con selección múltiple, desplegable con casillas. */
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const summary =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.name ?? "1")
        : `${selected.length} seleccionados`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
          selected.length > 0
            ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
            : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]",
        )}
      >
        <span className="font-medium">{label}:</span>
        {summary}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          {/* Capa para cerrar el desplegable al pinchar fuera */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-64 w-60 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
            {options.length === 0 ? (
              <p className="px-1 py-2 text-xs text-[var(--color-muted)]">
                Sin opciones
              </p>
            ) : (
              options.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--color-surface-hover)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onChange={() => onToggle(o.id)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <span className="truncate">{o.name}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Filtros del inventario: cada criterio admite varias opciones y todos se
 * combinan entre sí. El estado vive en la URL (`?proveedor=a&proveedor=b`), así
 * que la vista filtrada se puede compartir y sobrevive a un refresco.
 */
export function InventoryFilters({
  options,
}: {
  options: InventoryFilterOptions;
}): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected = {
    proveedor: searchParams.getAll("proveedor"),
    almacen: searchParams.getAll("almacen"),
    producto: searchParams.getAll("producto"),
  };
  const activeCount =
    selected.proveedor.length +
    selected.almacen.length +
    selected.producto.length;

  function toggle(key: keyof typeof selected, id: string): void {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll(key);
    params.delete(key);
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
    for (const v of next) params.append(key, v);
    router.push(`/inventario?${params.toString()}`);
  }

  function clear(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("proveedor");
    params.delete("almacen");
    params.delete("producto");
    router.push(`/inventario?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Filter className="w-4 h-4 text-[var(--color-muted)]" />
      <MultiSelect
        label="Proveedor"
        options={options.suppliers}
        selected={selected.proveedor}
        onToggle={(id) => toggle("proveedor", id)}
      />
      <MultiSelect
        label="Almacén"
        options={options.warehouses}
        selected={selected.almacen}
        onToggle={(id) => toggle("almacen", id)}
      />
      <MultiSelect
        label="Producto"
        options={options.materials}
        selected={selected.producto}
        onToggle={(id) => toggle("producto", id)}
      />
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="w-3.5 h-3.5" /> Limpiar filtros ({activeCount})
        </Button>
      )}
    </div>
  );
}
