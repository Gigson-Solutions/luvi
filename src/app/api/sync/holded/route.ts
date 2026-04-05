import { NextResponse } from "next/server";

/**
 * Cron job de Vercel — se ejecuta cada hora (ver vercel.json).
 * Solo sincroniza albaranes/facturas con Holded.
 * NO sincroniza inventario (la app es la fuente de verdad).
 *
 * TODO: implementar cuando Holded confirme permisos de API.
 */
export async function GET(): Promise<NextResponse> {
  // TODO: sincronizar albaranes pendientes de confirmar en Holded
  // const pendingShipments = await prisma.shipment.findMany({ where: { holdedAlbaranId: null, status: "EXPEDIDO" }})
  // for (const s of pendingShipments) { await createHoldedAlbaran(s) }

  return NextResponse.json({
    synced: 0,
    status: "stub",
    message: "Holded sync pendiente de configurar",
    timestamp: new Date().toISOString(),
  });
}
