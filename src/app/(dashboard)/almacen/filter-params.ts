/**
 * Valor de `?status=` que significa "sin filtrar por estado". Vive aparte de
 * `warehouse-filters.tsx` (componente de cliente) porque la página, que corre
 * en el servidor, no puede leer constantes exportadas desde un módulo cliente.
 */
export const ALL_STATUSES = "all";
