"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  id: string;
  name: string;
}

/** Un criterio con selección múltiple, desplegable con casillas. */
export function MultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: MultiSelectOption[];
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
