"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MultiSelect,
  type MultiSelectOption,
} from "@/components/ui/multi-select";
import { ALL_STATUSES } from "./filter-params";

type Key = "status" | "tipo" | "material" | "zone";

type MaterialOption = MultiSelectOption & { categoryId: string | null };

/** Materiales de los tipos elegidos; sin tipo elegido, todos. */
function materialsOfTypes(
  materials: MaterialOption[],
  types: string[],
): MaterialOption[] {
  if (types.length === 0) return materials;
  return materials.filter(
    (m) => m.categoryId !== null && types.includes(m.categoryId),
  );
}

/**
 * Filtros del inventario de sacas: cada criterio es un desplegable con casillas
 * y admite varias opciones; todos se combinan entre sí. El estado vive en la URL
 * (`?tipo=a&tipo=b`), así que la vista se puede compartir y sobrevive a un
 * refresco. Cambiar cualquier filtro vuelve a la página 1.
 *
 * Estado: sin parámetro se muestra "En almacén" (valor por defecto); si se
 * desmarcan todos, la URL lleva `status=all` y se listan sacas de cualquier
 * estado.
 */
export function WarehouseFilters({
  statuses,
  categories,
  materials,
  zones,
  selectedStatuses,
}: {
  statuses: MultiSelectOption[];
  categories: MultiSelectOption[];
  materials: MaterialOption[];
  zones: MultiSelectOption[];
  /** Estados efectivos (ya con el valor por defecto aplicado). */
  selectedStatuses: string[];
}): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected: Record<Key, string[]> = {
    status: selectedStatuses,
    tipo: searchParams.getAll("tipo"),
    material: searchParams.getAll("material"),
    zone: searchParams.getAll("zone"),
  };
  const visibleMaterials = materialsOfTypes(materials, selected.tipo);

  function push(params: URLSearchParams): void {
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/almacen?${qs}` : "/almacen", { scroll: false });
  }

  function setValues(
    params: URLSearchParams,
    key: Key,
    values: string[],
  ): void {
    params.delete(key);
    for (const v of values) params.append(key, v);
  }

  function toggle(key: Key, id: string): void {
    const params = new URLSearchParams(searchParams.toString());
    const current = selected[key];
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];

    if (key === "status") {
      // Estado "Todos" explícito: sin parámetro volvería al valor por defecto.
      const withoutAll = next.filter((v) => v !== ALL_STATUSES);
      setValues(
        params,
        "status",
        withoutAll.length > 0 ? withoutAll : [ALL_STATUSES],
      );
    } else {
      setValues(params, key, next);
    }

    if (key === "tipo") {
      // Cambiar el tipo descarta los materiales que ya no le pertenecen.
      const allowed = new Set(
        materialsOfTypes(materials, next).map((m) => m.id),
      );
      setValues(
        params,
        "material",
        selected.material.filter((v) => allowed.has(v)),
      );
    }
    push(params);
  }

  function clear(): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["status", "tipo", "material", "zone"] as const) {
      params.delete(key);
    }
    push(params);
  }

  const hasFilters =
    selected.tipo.length > 0 ||
    selected.material.length > 0 ||
    selected.zone.length > 0 ||
    !(selectedStatuses.length === 1 && selectedStatuses[0] === "EN_ALMACEN");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Filter className="w-4 h-4 text-[var(--color-muted)]" />
      <MultiSelect
        label="Estado"
        options={statuses}
        selected={selected.status.filter((v) => v !== ALL_STATUSES)}
        onToggle={(id) => toggle("status", id)}
      />
      {categories.length > 0 && (
        <MultiSelect
          label="Tipo"
          options={categories}
          selected={selected.tipo}
          onToggle={(id) => toggle("tipo", id)}
        />
      )}
      {visibleMaterials.length > 0 && (
        <MultiSelect
          label="Material"
          options={visibleMaterials}
          selected={selected.material}
          onToggle={(id) => toggle("material", id)}
        />
      )}
      {zones.length > 0 && (
        <MultiSelect
          label="Zona"
          options={zones}
          selected={selected.zone}
          onToggle={(id) => toggle("zone", id)}
        />
      )}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="w-3.5 h-3.5" /> Restablecer filtros
        </Button>
      )}
    </div>
  );
}
