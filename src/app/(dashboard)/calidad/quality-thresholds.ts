/**
 * Constantes y helpers de la rejilla de muestras de calidad.
 *
 * Fuente única de verdad compartida por el servicio, las Server Actions y la
 * isla cliente del editor: columnas de la hoja (Densidad + contaminantes),
 * turnos y el cálculo de estado OK/NOK por rango de densidad.
 *
 * El rango de densidad es configurable (tabla `config`, clave `quality_ranges`);
 * estos son los valores por defecto validados con el cliente (330–370 g).
 */

export interface DensityRange {
  min: number;
  max: number;
}

/** Rango de densidad OK por defecto (g). Sobreescribible desde `config`. */
export const DEFAULT_DENSITY_RANGE: DensityRange = { min: 330, max: 370 };

/** Número fijo de muestras por registro (hoja tipo Excel). */
export const SAMPLES_PER_RECORD = 20;

/** Columnas medibles de cada muestra. */
export const SAMPLE_MEASURE_KEYS = [
  "density",
  "pvc",
  "cola",
  "multicapas",
  "metal",
  "otros",
] as const;

export type SampleMeasureKey = (typeof SAMPLE_MEASURE_KEYS)[number];

export const SAMPLE_MEASURE_LABELS: Record<SampleMeasureKey, string> = {
  density: "Densidad",
  pvc: "PVC",
  cola: "Cola",
  multicapas: "Multicapas",
  metal: "Metal",
  otros: "Otros",
};

export const SAMPLE_MEASURE_UNITS: Record<SampleMeasureKey, string> = {
  density: "g",
  pvc: "%",
  cola: "%",
  multicapas: "%",
  metal: "%",
  otros: "%",
};

/** Turnos de trabajo (naming validado con cliente). */
export const SHIFTS = ["Mañana", "Tarde", "Noche"] as const;
export type Shift = (typeof SHIFTS)[number];

/** Estado de una muestra o registro. Coincide con el enum `QualityResult`. */
export type SampleStatus = "OK" | "NOK" | "PENDIENTE";

/** Estado automático de una muestra según su densidad y el rango configurado. */
export function densityStatus(
  density: number | null | undefined,
  range: DensityRange,
): SampleStatus {
  if (density == null || Number.isNaN(density)) return "PENDIENTE";
  return density >= range.min && density <= range.max ? "OK" : "NOK";
}
