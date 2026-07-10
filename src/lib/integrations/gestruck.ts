/**
 * Integración con básculas Gestruck (Giropes / Gesnet).
 *
 * API real (validar con José/Melder en http://192.168.1.200/swagger):
 *   - Auth: header `ApiKey`
 *   - GET /api/v1/weighing/search?Vehicle=XX&Status=Completed
 *   - Respuesta: WeighingViewDto (esquema exacto pendiente)
 *
 * Conectividad en producción: WireGuard + VPS (NO Cloudflare, por bloqueos
 * LaLiga en ES en sistema 24/7). En local no está configurado → fallback manual.
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
      headers: { ApiKey: key },
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
