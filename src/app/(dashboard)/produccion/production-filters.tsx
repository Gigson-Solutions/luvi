"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHIFTS, isShift, shiftLabel, type Shift } from "@/lib/shifts";
import { cn } from "@/lib/utils";

/**
 * Filtros de Producción: día y turno (mañana 06–14, tarde 14–22, noche
 * 22–06). Viven en la URL (`?dia=2026-09-30&turno=noche`) junto a la pestaña.
 */
export function ProductionFilters(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const day = searchParams.get("dia") ?? "";
  const turno = searchParams.get("turno");
  const shift: Shift | null = isShift(turno) ? turno : null;
  const activeCount = (day ? 1 : 0) + (shift ? 1 : 0);

  function set(key: "dia" | "turno", value: string | null): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `/produccion?${qs}` : "/produccion");
  }

  function clear(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("dia");
    params.delete("turno");
    const qs = params.toString();
    router.push(qs ? `/produccion?${qs}` : "/produccion");
  }

  const options: { value: Shift | null; label: string; title?: string }[] = [
    { value: null, label: "Todos" },
    ...(Object.keys(SHIFTS) as Shift[]).map((s) => ({
      value: s,
      label: SHIFTS[s].label,
      title: shiftLabel(s),
    })),
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <Filter className="w-4 h-4 text-[var(--color-muted)]" />
      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
        <span className="font-medium">Día:</span>
        <input
          type="date"
          aria-label="Día"
          value={day}
          onChange={(e) => set("dia", e.target.value)}
          className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-foreground)]"
        />
      </label>
      <div
        role="group"
        aria-label="Turno"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)]"
      >
        <span className="font-medium">Turno:</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]">
          {options.map((o) => {
            const active = o.value === shift;
            return (
              <button
                key={o.label}
                type="button"
                title={o.title}
                aria-pressed={active}
                onClick={() => set("turno", o.value)}
                className={cn(
                  "h-8 px-3 text-sm transition-colors",
                  active
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {shift && (
        <span className="text-xs text-[var(--color-muted)]">
          {shiftLabel(shift)}
          {shift === "noche" && day
            ? " · hasta las 06:00 del día siguiente"
            : ""}
        </span>
      )}
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="w-3.5 h-3.5" /> Limpiar filtros ({activeCount})
        </Button>
      )}
    </div>
  );
}
