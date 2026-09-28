"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import type { InventoryFilterOptions } from "@/lib/services/inventory.service";

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
