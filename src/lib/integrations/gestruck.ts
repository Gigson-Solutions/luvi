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

/**
 * Esquema real de la API Gestruck (confirmado contra la báscula de planta, jul 2026):
 * `search` devuelve una página `{ Content: WeighingViewDto[], ... }` (PascalCase).
 * Cada pesaje lleva los pesos en `Lines[]`, no en el header:
 *   FirstWeighing  = primera pesada (camión cargado → bruto en recepción)
 *   SecondWeighing = segunda pesada (camión vacío → tara en recepción)
 *   NetWeigh       = neto (= |First − Second|)
 */
interface WeighingLineDto {
  FirstWeighing?: number;
  SecondWeighing?: number;
  NetWeigh?: number;
  FirstWeighingDate?: string;
  SecondWeighingDate?: string;
  [key: string]: unknown;
}

interface WeighingViewDto {
  Code?: string;
  Vehicle?: string;
  Type?: string; // "Input" | "Output"
  Status?: string;
  CreationWeighDate?: string;
  OriginWeight?: number;
  Lines?: WeighingLineDto[];
  [key: string]: unknown;
}

interface WeighingSearchResponse {
  Content?: WeighingViewDto[];
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
    // La API pagina de MÁS ANTIGUO a MÁS NUEVO y no admite orden descendente,
    // así que pedimos una ventana amplia de esa matrícula y elegimos el pesaje
    // más reciente en cliente (un vehículo repite visitas → no vale `Size=1`).
    // `StartDate = hoy` (hora de planta) acota a los pesajes del día: así una
    // matrícula que ya vino otro día nunca trae un pesaje antiguo por error.
    const today = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Europe/Madrid",
    }); // YYYY-MM-DD
    const qs = new URLSearchParams({
      Status: "Completed",
      Size: "100",
      StartDate: today,
    });
    if (params.vehicle) qs.set("Vehicle", params.vehicle);

    const res = await fetch(`${url}/api/v1/weighing/search?${qs.toString()}`, {
      headers: { "X-Api-Key": key, accept: "text/plain" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gestruck ${res.status}`);

    const body = (await res.json()) as WeighingSearchResponse;
    const items = body.Content ?? [];
    const dateOf = (w: WeighingViewDto): string =>
      w.Lines?.[0]?.SecondWeighingDate ??
      w.Lines?.[0]?.FirstWeighingDate ??
      w.CreationWeighDate ??
      "";
    // Pesaje más reciente (fechas ISO-8601 UTC → comparación lexicográfica válida).
    const item = items.reduce<WeighingViewDto | undefined>(
      (latest, w) => (!latest || dateOf(w) > dateOf(latest) ? w : latest),
      undefined,
    );
    const line = item?.Lines?.[0];
    if (!item || !line) {
      return {
        manual: true,
        reason:
          "Sin pesaje de báscula hoy para esta matrícula (introduce el peso a mano)",
      };
    }

    // Bruto = pesada mayor, tara = pesada menor (robusto para Input y Output).
    const a = line.FirstWeighing;
    const b = line.SecondWeighing;
    const gross = a != null && b != null ? Math.max(a, b) : (a ?? b);
    const tare = a != null && b != null ? Math.min(a, b) : undefined;
    const net =
      line.NetWeigh ??
      (gross != null && tare != null ? gross - tare : undefined);

    return {
      manual: false,
      weight: gross,
      tare,
      net,
      weighedAt:
        line.SecondWeighingDate ??
        line.FirstWeighingDate ??
        item.CreationWeighDate,
      scaleId: params.scaleId,
    };
  } catch (err) {
    return {
      manual: true,
      reason: err instanceof Error ? err.message : "Báscula no disponible",
    };
  }
}
