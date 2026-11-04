import { SackStatus } from "@prisma/client";

/**
 * Valor de `?status=` que significa "sin filtrar por estado". Vive aparte de
 * `warehouse-filters.tsx` (componente de cliente) porque la página, que corre
 * en el servidor, no puede leer constantes exportadas desde un módulo cliente.
 */
export const ALL_STATUSES = "all";

const STATUS_VALUES = Object.values(SackStatus) as string[];

/**
 * Estados que filtra la pantalla de Almacén a partir de los `?status=` de la
 * URL. Sin estados válidos, solo EN_ALMACEN (valor por defecto); `all` = lista
 * vacía = cualquier estado. Compartido por la página y por la acción que asigna
 * proveedor en bloque, que tienen que ver exactamente las mismas sacas.
 */
export function resolveStatusFilter(raw: string[]): SackStatus[] {
  if (raw.includes(ALL_STATUSES)) return [];
  const valid = raw.filter((v) => STATUS_VALUES.includes(v)) as SackStatus[];
  return valid.length > 0 ? valid : [SackStatus.EN_ALMACEN];
}
