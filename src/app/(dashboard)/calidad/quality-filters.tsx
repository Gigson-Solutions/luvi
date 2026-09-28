"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MultiSelect,
  type MultiSelectOption,
} from "@/components/ui/multi-select";

/** Parámetros de URL que controla esta barra. */
const FILTER_KEYS = ["desde", "hasta", "cliente", "producto"] as const;

/**
 * Filtros de Calidad: rango de fechas, cliente y producto. Todo vive en la URL
 * (`?desde=2026-09-01&hasta=2026-09-30&cliente=A&producto=id`). Con un rango
 * de fechas la tabla deja de ir por meses y muestra ese periodo; sin fechas,
 * cliente y producto filtran el mes elegido.
 */
export function QualityFilters({
  clients,
  materials,
}: {
  clients: string[];
  materials: MultiSelectOption[];
}): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("desde") ?? "";
  const to = searchParams.get("hasta") ?? "";
  const selected = {
    cliente: searchParams.getAll("cliente"),
    producto: searchParams.getAll("producto"),
  };
  const activeCount =
    (from ? 1 : 0) +
    (to ? 1 : 0) +
    selected.cliente.length +
    selected.producto.length;

  function push(params: URLSearchParams): void {
    const qs = params.toString();
    router.push(qs ? `/calidad?${qs}` : "/calidad");
  }

  function setDate(key: "desde" | "hasta", value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    push(params);
  }

  function toggle(key: keyof typeof selected, id: string): void {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll(key);
    params.delete(key);
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
    for (const v of next) params.append(key, v);
    push(params);
  }

  function clear(): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    push(params);
  }

  const dateInput =
    "h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-foreground)]";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <Filter className="w-4 h-4 text-[var(--color-muted)]" />
      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
        <span className="font-medium">Desde:</span>
        <input
          type="date"
          aria-label="Desde"
          value={from}
          max={to || undefined}
          onChange={(e) => setDate("desde", e.target.value)}
          className={dateInput}
        />
      </label>
      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
        <span className="font-medium">Hasta:</span>
        <input
          type="date"
          aria-label="Hasta"
          value={to}
          min={from || undefined}
          onChange={(e) => setDate("hasta", e.target.value)}
          className={dateInput}
        />
      </label>
      <MultiSelect
        label="Cliente"
        options={clients.map((c) => ({ id: c, name: c }))}
        selected={selected.cliente}
        onToggle={(id) => toggle("cliente", id)}
      />
      <MultiSelect
        label="Producto"
        options={materials}
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
