/**
 * Integración con Holded (API v2) — SOLO contactos y albaranes (waybills).
 * Se usa al expedir un envío. Holded NO es fuente de verdad del inventario.
 *
 * API v2: base https://api.holded.com/api/v2, auth `Authorization: Bearer pat_...`.
 *   - POST /contacts  { name, type:"client" }        → { id }
 *   - POST /waybills  { contact_id, items:[{name,units,price}], notes? } → { id }
 *
 * En local sin HOLDED_API_KEY devolvemos un resultado simulado para no bloquear.
 */

export interface AlbaranLine {
  name: string;
  units: number;
  price?: number;
}

export interface CreateAlbaranInput {
  contactHoldedId?: string | null;
  buyerName: string;
  reference: string;
  lines: AlbaranLine[];
  notes?: string;
}

export interface AlbaranResult {
  ok: boolean;
  simulated: boolean;
  holdedId?: string; // id del albarán (waybill)
  contactId?: string; // contacto usado/creado (para persistir en el comprador)
  error?: string;
}

const API = process.env.HOLDED_API_URL ?? "https://api.holded.com/api/v2";
const TIMEOUT_MS = 8000;

function headers(key: string): HeadersInit {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/**
 * Error legible de una respuesta de Holded: estado + el motivo que devuelve
 * (recortado). Sin él, un 400 no dice qué campo rechaza y no hay forma de
 * corregirlo. También se deja en el log del servidor.
 */
async function holdedError(label: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    detail = (await res.text()).replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    // Sin cuerpo legible: nos quedamos con el estado.
  }
  console.error(`[holded] ${label} ${res.status}: ${detail || "(sin cuerpo)"}`);
  return new Error(
    `Holded ${label} ${res.status}${detail ? `: ${detail}` : ""}`,
  );
}

/** Crea un contacto tipo cliente y devuelve su id. */
async function createContact(key: string, name: string): Promise<string> {
  const res = await fetch(`${API}/contacts`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ name, type: "client" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw await holdedError("contacto", res);
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Holded no devolvió id de contacto");
  return data.id;
}

/**
 * Crea un albarán en Holded. Si el comprador no tiene contacto (contactHoldedId),
 * lo crea al vuelo y devuelve su id en `contactId` para persistirlo.
 * Fallback simulado si no hay API key.
 */
export async function createAlbaran(
  input: CreateAlbaranInput,
): Promise<AlbaranResult> {
  const key = process.env.HOLDED_API_KEY;
  if (!key) {
    return { ok: true, simulated: true, holdedId: `SIM-${input.reference}` };
  }

  try {
    const contactId =
      input.contactHoldedId ?? (await createContact(key, input.buyerName));

    const res = await fetch(`${API}/waybills`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        contact_id: contactId,
        notes: input.notes ?? input.reference,
        items: input.lines.map((l) => ({
          name: l.name,
          units: l.units,
          price: l.price ?? 0,
        })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw await holdedError("waybill", res);

    const data = (await res.json()) as { id?: string };
    return { ok: true, simulated: false, holdedId: data.id, contactId };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      error: err instanceof Error ? err.message : "Error Holded",
    };
  }
}
