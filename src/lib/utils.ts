import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formatea kg a TM si >= 1000, si no en kg */
export function formatKg(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(2)} TM`;
  }
  return `${kg.toFixed(1)} kg`;
}

/** Formatea un importe en euros con dos decimales (es-ES). */
export function formatEuro(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${amount.toFixed(2)} €`;
}

/** Formatea fecha en locale es-ES */
export function formatDate(date: Date | string, includeTime = false): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime && { hour: "2-digit", minute: "2-digit" }),
  };
  return d.toLocaleDateString("es-ES", options);
}

/** Genera número de lote en formato DDMMYY-nºcamión */
export function generateLotNumber(date: Date, seq: number): string {
  // Formato DDMMYY-X (X = correlativo de camión del día). El primer camión del
  // 3 de septiembre de 2026 es `030926-1`. Sustituye al YYYYMMDD-X de GL-55.
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}-${seq}`;
}

/**
 * Identificador de una saca dentro de su lote, en formato `NUMERO_SACA/LOTE`
 * (ej. `1/190726-1`). Devuelve solo el nº de lote si la saca todavía no tiene
 * correlativo asignado, y "—" si no pertenece a ningún lote.
 */
export function formatSackNumber(
  lotSequence: number | null | undefined,
  lotNumber: string | null | undefined,
): string {
  if (!lotNumber) return "—";
  if (lotSequence == null) return lotNumber;
  return `${lotSequence}/${lotNumber}`;
}
