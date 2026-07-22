/**
 * Cola de impresión de etiquetas QR.
 *
 * Impresora probablemente Zebra (ZPL). Marca pendiente de confirmar con Paula,
 * por eso la abstracción: generamos el ZPL y lo dejamos listo para enviar al
 * endpoint/servicio de impresión cuando se confirme el hardware.
 */

export interface LabelData {
  qrCode: string;
  title: string; // p.ej. referencia o lote
  subtitle?: string; // p.ej. material / peso
  batchNumber?: string;
}

/** Genera el ZPL de una etiqueta con QR (formato Zebra). */
export function buildZpl(label: LabelData): string {
  return [
    "^XA",
    "^CF0,30",
    `^FO40,40^FDLuvi2000^FS`,
    `^FO40,90^FD${label.title}^FS`,
    label.subtitle ? `^FO40,130^CF0,24^FD${label.subtitle}^FS` : "",
    label.batchNumber ? `^FO40,165^CF0,24^FD${label.batchNumber}^FS` : "",
    `^FO300,40^BQN,2,6^FDMA,${label.qrCode}^FS`,
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Envía etiquetas a la cola de impresión (stub hasta confirmar impresora). */
export async function enqueueLabels(labels: LabelData[]): Promise<{
  queued: number;
  simulated: boolean;
}> {
  const endpoint = process.env.QR_PRINTER_URL;
  if (!endpoint) {
    // Sin impresora configurada: el QR se genera igual, solo no se imprime físicamente.
    return { queued: labels.length, simulated: true };
  }
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: labels.map(buildZpl).join("\n"),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  return { queued: labels.length, simulated: false };
}
