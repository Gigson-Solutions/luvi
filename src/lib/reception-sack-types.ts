/**
 * Tipos de saca de recepción (naming validado con cliente).
 *
 * Módulo puro (sin dependencias de servidor/Prisma) para poder importarse
 * tanto en Server Components/servicios como en Client Components.
 */

export const SACK_TYPES = [
  "sacas_altas",
  "sacas_bajas",
  "saquitos",
  "balas",
] as const;

export type SackType = (typeof SACK_TYPES)[number];

/** Etiqueta legible (español) para cada tipo de saca. */
export const SACK_TYPE_LABELS: Record<SackType, string> = {
  sacas_altas: "Sacas altas",
  sacas_bajas: "Sacas bajas",
  saquitos: "Saquitos",
  balas: "Balas",
};

/** Opciones {value,label} para selects. */
export const SACK_TYPE_OPTIONS: { value: SackType; label: string }[] =
  SACK_TYPES.map((value) => ({ value, label: SACK_TYPE_LABELS[value] }));

/** Devuelve la etiqueta legible del tipo de saca, o "—" si no está definido. */
export function sackTypeLabel(value?: string | null): string {
  if (!value) return "—";
  return SACK_TYPE_LABELS[value as SackType] ?? value;
}
