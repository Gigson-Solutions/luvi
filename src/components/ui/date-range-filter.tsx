"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

/** "YYYY-MM-DD" local de un Date. */
function toInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const PRESETS: { label: string; days: number }[] = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

/**
 * Filtro de rango de fechas reutilizable. Sincroniza `from`/`to` en la URL
 * ("YYYY-MM-DD") para que cualquier página server pueda leerlos.
 */
export function DateRangeFilter({
  from,
  to,
}: {
  from: string;
  to: string;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function commit(next: { from: string; to: string }): void {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("from", next.from);
    qs.set("to", next.to);
    router.push(`${pathname}?${qs.toString()}`);
  }

  function applyPreset(days: number): void {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    commit({ from: toInput(start), to: toInput(end) });
  }

  const activeDays = ((): number | null => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return PRESETS.some((p) => p.days === days) ? days : null;
  })();

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)]">
        <Calendar className="w-3.5 h-3.5" />
        Rango:
      </span>
      <input
        type="date"
        value={from}
        max={to}
        onChange={(e) => commit({ from: e.target.value, to })}
        className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-foreground)]"
      />
      <span className="text-xs text-[var(--color-muted)]">→</span>
      <input
        type="date"
        value={to}
        min={from}
        onChange={(e) => commit({ from, to: e.target.value })}
        className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-foreground)]"
      />
      <div className="flex items-center gap-1.5 ml-1">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => applyPreset(p.days)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              activeDays === p.days
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-surface-hover)] text-[var(--color-foreground)] hover:bg-[var(--color-border)]",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
