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
 *
 * FUENTES (GL báscula): camión (BASCULA) por API, y si la API no responde →
 * BBDD (fallback). Plataforma (sacas de salida) → BBDD directa (la API no la
 * expone). Ver `gestruck-db.ts`.
 */
import { readTruckWeightFromDb, readPlatformWeightFromDb } from "./gestruck-db";

export interface WeightReading {
  manual: boolean;
  /** Pesaje a medias (solo 1 pesada hecha): aún no hay neto. */
  inProgress?: boolean;
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
    return {
      manual: true,
      reason: "La báscula no está conectada. Introduce el peso a mano.",
    };
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
    // Sin filtro de Status: así también vemos un pesaje "a medias" (primera
    // pesada hecha, falta la segunda) y podemos avisar de ello.
    const qs = new URLSearchParams({
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
          "La báscula todavía no tiene el pesaje de esta matrícula. Comprueba que el camión ha terminado de pesar, o introduce el peso a mano.",
      };
    }

    // Pesaje a medias: solo se ha hecho una pesada (falta la segunda) → aún no
    // hay neto. Avisamos en vez de dar un peso incompleto.
    // OJO: la API devuelve SecondWeighing = 0 (no null) mientras falta la 2ª
    // pesada, así que NO sirve como señal. La 2ª pesada solo "existe" cuando
    // tiene fecha (SecondWeighingDate), y la API marca el pesaje como
    // "Completed" al cerrarlo.
    const hasFirst = line.FirstWeighingDate != null;
    const hasSecond = line.SecondWeighingDate != null;
    const completed = item.Status === "Completed" || (hasFirst && hasSecond);
    if (!completed) {
      return {
        manual: true,
        inProgress: true,
        reason:
          "El pesaje está a medias: se ha pesado con carga pero falta la pesada sin carga. Espera a que terminen de pesar o introduce el peso a mano.",
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
    // La API no responde → FALLBACK a la BBDD de Gestruck (mismo camión).
    console.error("[gestruck] API no disponible, pruebo BBDD:", err);
    try {
      if (params.vehicle) {
        const db = await readTruckWeightFromDb(params.vehicle);
        if (db && db.weight != null) {
          return {
            manual: false,
            weight: db.weight,
            tare: db.tare,
            net: db.net,
            weighedAt: db.weighedAt,
            scaleId: params.scaleId,
          };
        }
      }
    } catch (dbErr) {
      console.error("[gestruck] BBDD tampoco disponible:", dbErr);
    }
    return {
      manual: true,
      reason:
        "No se pudo conectar con la báscula. Introduce el peso a mano y vuelve a intentarlo en un momento.",
    };
  }
}

/**
 * Peso de la PLATAFORMA (sacas de salida). Se lee de la BBDD de Gestruck: la
 * última pesada de big bag (IdDeviceSystem=2). Fallback a manual si no hay dato
 * o la BBDD no está disponible.
 */
export async function readPlatformWeight(): Promise<WeightReading> {
  try {
    const db = await readPlatformWeightFromDb();
    if (db && db.net != null) {
      return {
        manual: false,
        weight: db.net,
        net: db.net,
        weighedAt: db.weighedAt,
      };
    }
    return {
      manual: true,
      reason:
        "No hay ninguna saca pesada en la plataforma. Pesa el big bag en Gestruck (o introduce el peso a mano).",
    };
  } catch (err) {
    console.error("[gestruck] fallo al leer la plataforma:", err);
    return {
      manual: true,
      reason:
        "No se pudo leer la báscula de plataforma. Introduce el peso a mano.",
    };
  }
}
