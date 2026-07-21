/**
 * Integración con básculas Gestruck (Básculas Romero).
 *
 * Contrato API confirmado por José Manuel (Básculas Romero), jul 2026:
 *   - El servicio corre en el PC de planta (Laura), Swagger en :5050/swagger/index.html
 *   - Auth: header `X-Api-Key`
 *   - GET /api/v1/weighing/search  (accept: text/plain) → listado de pesajes
 *   - Ejemplo: curl -H 'X-Api-Key: <key>' http://<host>:5050/api/v1/weighing/search
 *   - Respuesta: WeighingViewDto (campos exactos pendientes de ver en Swagger)
 *
 * `GESTRUCK_API_URL` debe incluir host:puerto (p.ej. http://10.8.0.2:5050 por el
 * túnel WireGuard, o http://192.168.1.200:5050 en LAN). `GESTRUCK_API_KEY` y URL
 * viven SOLO en el servidor (/root/luvi.env), nunca en el repo.
 *
 * Conectividad en producción: WireGuard + VPS (NO Cloudflare, por bloqueos
 * LaLiga en ES en sistema 24/7). En local no está configurado → fallback manual.
 * NOTA planta: la API escuchaba solo en `localhost:5050`; para alcanzarla por el
 * túnel debe bindear a 0.0.0.0:5050 y abrir el puerto 5050 en el firewall del PC.
 *
 * REGLA DE ORO: si Gestruck no está configurado o falla, SIEMPRE devolvemos
 * `{ manual: true }` para que el operario introduzca el peso a mano. La báscula
 * nunca debe bloquear la operativa.
 */

export interface WeightReading {
  manual: boolean;
  weight?: number; // kg
  tare?: number; // kg
  net?: number; // kg
  weighedAt?: string; // ISO
  scaleId?: string;
  reason?: string;
}

interface WeighingViewDto {
  netWeight?: number;
  grossWeight?: number;
  tare?: number;
  weighingDate?: string;
  scaleId?: string | number;
  [key: string]: unknown;
}

const TIMEOUT_MS = 3000;

/** Lee el último pesaje de un vehículo/matrícula. Fallback a manual si falla. */
export async function readWeight(params: {
  vehicle?: string;
  scaleId?: string;
}): Promise<WeightReading> {
  const url = process.env.GESTRUCK_API_URL;
  const key = process.env.GESTRUCK_API_KEY;

  if (!url || !key) {
    return { manual: true, reason: "Gestruck no configurado (entrada manual)" };
  }

  try {
    const qs = new URLSearchParams({ Status: "Completed", Size: "1" });
    if (params.vehicle) qs.set("Vehicle", params.vehicle);

    const res = await fetch(`${url}/api/v1/weighing/search?${qs.toString()}`, {
      headers: { "X-Api-Key": key, accept: "text/plain" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gestruck ${res.status}`);

    const body = (await res.json()) as
      { items?: WeighingViewDto[] } | WeighingViewDto[];
    const item = Array.isArray(body) ? body[0] : body.items?.[0];
    if (!item) return { manual: true, reason: "Sin pesajes recientes" };

    return {
      manual: false,
      weight: item.grossWeight ?? item.netWeight,
      tare: item.tare,
      net: item.netWeight,
      weighedAt: item.weighingDate,
      scaleId: item.scaleId != null ? String(item.scaleId) : params.scaleId,
    };
  } catch (err) {
    return {
      manual: true,
      reason: err instanceof Error ? err.message : "Báscula no disponible",
    };
  }
}
