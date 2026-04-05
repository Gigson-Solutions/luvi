import { NextRequest, NextResponse } from "next/server";

/**
 * Cola de impresión de etiquetas QR.
 * Impresora pendiente de confirmar: probablemente Zebra (ZPL).
 *
 * TODO: implementar cuando se confirme marca/modelo de impresora.
 */

interface PrintJob {
  sackId: string;
  qrCode: string;
  weight: number;
  material: string;
  warehouse: string;
  printedAt: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as PrintJob | PrintJob[];
  const jobs = Array.isArray(body) ? body : [body];

  // TODO: implementar envío ZPL a impresora Zebra
  // const zpl = generateZPL(job);
  // await sendToZebra(zpl);

  console.log(`[qr-print] Cola: ${jobs.length} etiqueta(s) — STUB`);

  return NextResponse.json({
    queued: jobs.length,
    status: "stub",
    message: "Impresora pendiente de configurar",
  });
}
