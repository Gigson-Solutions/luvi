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
export function generateLotNumber(date: Date, containerNumber: number): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}-${containerNumber}`;
}
