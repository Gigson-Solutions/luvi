/**
 * Turnos de planta (24/7). Las horas son de Madrid; el de noche cruza la
 * medianoche y pertenece al día en que empieza (22:00 del día → 06:00 del
 * siguiente).
 */
export const SHIFTS = {
  manana: { label: "Mañana", from: 6, to: 14 },
  tarde: { label: "Tarde", from: 14, to: 22 },
  noche: { label: "Noche", from: 22, to: 6 },
} as const;

export type Shift = keyof typeof SHIFTS;

export function isShift(v: string | undefined | null): v is Shift {
  return v === "manana" || v === "tarde" || v === "noche";
}

/** Texto del turno con su franja: "Noche (22:00–06:00)". */
export function shiftLabel(shift: Shift): string {
  const s = SHIFTS[shift];
  const hh = (h: number): string => `${String(h).padStart(2, "0")}:00`;
  return `${s.label} (${hh(s.from)}–${hh(s.to)})`;
}

/** Filtro de periodo de Producción: día (YYYY-MM-DD) y/o turno. */
export interface ProductionPeriod {
  day: string | null;
  shift: Shift | null;
}

/** Lee `?dia=` y `?turno=` de la URL descartando valores mal formados. */
export function parseProductionPeriod(params: {
  dia?: string;
  turno?: string;
}): ProductionPeriod {
  const day =
    params.dia && /^\d{4}-\d{2}-\d{2}$/.test(params.dia) ? params.dia : null;
  return { day, shift: isShift(params.turno) ? params.turno : null };
}

export function hasPeriod(p: ProductionPeriod): boolean {
  return p.day != null || p.shift != null;
}
