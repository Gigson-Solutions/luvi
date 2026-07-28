import { NextRequest, NextResponse } from "next/server";
import { enqueueLabels, type LabelData } from "@/lib/integrations/qr-printer";

/**
 * Cola de impresión de etiquetas QR (Zebra / ZPL).
 *
 * Recibe uno o varios trabajos de impresión, genera el ZPL y lo encola contra
 * el servicio de impresión (`QR_PRINTER_URL`). Si no hay impresora configurada,
 * el ZPL se genera igual pero no se imprime (`simulated: true`) — la impresión
 * nunca bloquea la operativa. La abstracción es extensible a otras marcas.
 */

interface PrintJob {
  sackId: string;
  qrCode: string;
  weight: number;
  material: string;
  warehouse: string;
  batchNumber?: string;
  printedAt?: string;
  // Campos de la plantilla A5 (opcionales hasta cablear su origen en los flujos).
  codigoProducto?: string;
  tipoProducto?: string;
  contenedor?: string;
  bl?: string;
  proyecto?: string;
  fecha?: string;
}

/** Mapea un trabajo de impresión a los datos de etiqueta (LabelData). */
function toLabel(job: PrintJob): LabelData {
  return {
    qrCode: job.qrCode,
    codigoProducto: job.codigoProducto,
    tipoProducto: job.tipoProducto,
    nombreProducto: job.material,
    loteOSaca: job.batchNumber ?? job.sackId,
    contenedor: job.contenedor,
    bl: job.bl,
    proyecto: job.proyecto,
    fecha: job.fecha,
    pesoNetoKg: job.weight,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as PrintJob | PrintJob[];
  const jobs = Array.isArray(body) ? body : [body];

  const result = await enqueueLabels(jobs.map(toLabel));

  return NextResponse.json({
    queued: result.queued,
    status: result.simulated ? "simulated" : "queued",
    message: result.simulated
      ? "Impresora no configurada — etiqueta generada, sin impresión física"
      : "Etiquetas enviadas a la cola de impresión",
  });
}
