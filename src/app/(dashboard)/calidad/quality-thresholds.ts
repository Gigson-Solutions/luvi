/**
 * Umbrales de aceptación de los parámetros de calidad.
 *
 * Fuente única de verdad compartida por el servicio, las Server Actions y el
 * diálogo cliente: así el aviso de "fuera de rango" (que pide `overrideReason`
 * al forzar OK) se calcula igual en cliente y servidor.
 *
 * `density` en g/cm³; el resto son porcentajes (contaminantes → cuanto más
 * bajos, mejor).
 */

export interface Threshold {
  min?: number;
  max?: number;
}

/**
 * Tipos de muestra de un registro de calidad. Provisional MP/PT — pendiente de
 * confirmar con Paula; cambiar aquí (y no hace falta migración, se guarda como
 * texto en `sampleType`).
 */
export const SAMPLE_TYPES = ["MP", "PT"] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];

export const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  MP: "MP (materia prima)",
  PT: "PT (producto terminado)",
};

/** Claves de los parámetros medibles de un registro de calidad. */
export const MEASURE_KEYS = [
  "density",
  "pvcPct",
  "gluePct",
  "multilayerPct",
  "metalPct",
  "otherPct",
] as const;

export type MeasureKey = (typeof MEASURE_KEYS)[number];

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  density: "Densidad (g/cm³)",
  pvcPct: "PVC (%)",
  gluePct: "Cola (%)",
  multilayerPct: "Multicapa (%)",
  metalPct: "Metal (%)",
  otherPct: "Otros (%)",
};

export const QUALITY_THRESHOLDS: Record<MeasureKey, Threshold> = {
  density: { min: 0.85, max: 1.05 },
  pvcPct: { max: 2 },
  gluePct: { max: 5 },
  multilayerPct: { max: 10 },
  metalPct: { max: 1 },
  otherPct: { max: 5 },
};

export type Measures = Partial<Record<MeasureKey, number | null | undefined>>;

/** Devuelve las claves de los parámetros cuyo valor está fuera de rango. */
export function getOutOfRangeMeasures(measures: Measures): MeasureKey[] {
  return MEASURE_KEYS.filter((key) => {
    const value = measures[key];
    if (value == null || Number.isNaN(value)) return false;
    const { min, max } = QUALITY_THRESHOLDS[key];
    if (min != null && value < min) return true;
    if (max != null && value > max) return true;
    return false;
  });
}

/** Rango legible para mostrar en UI (p.ej. "≤ 2" o "0.85–1.05"). */
export function formatThreshold(key: MeasureKey): string {
  const { min, max } = QUALITY_THRESHOLDS[key];
  if (min != null && max != null) return `${min}–${max}`;
  if (max != null) return `≤ ${max}`;
  if (min != null) return `≥ ${min}`;
  return "—";
}
