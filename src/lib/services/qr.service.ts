import { prisma } from "@/lib/prisma";
import { type Prisma, type SackStatus } from "@prisma/client";
import type { LabelData } from "@/lib/integrations/qr-printer";
import { formatSackNumber } from "@/lib/utils";

/**
 * Servicio de Gestión QR — lecturas para buscar una saca y reimprimir su etiqueta.
 *
 * La saca (`Sack`) es la única entidad con QR del sistema. Este servicio expone
 * los datos que necesita la página `/qr`: la vista previa del código y los campos
 * que alimentan el trabajo de impresión (`POST /api/qr-print`).
 */

/** Tipo de producto para la etiqueta (MP / PT / Subproducto / Rechazo). */
function tipoProducto(status: SackStatus): string {
  switch (status) {
    case "PRODUCTO_TERMINADO":
      return "PT";
    case "SUBPRODUCTO":
      return "Subproducto";
    case "RECHAZO":
      return "Rechazo";
    default:
      return "MP";
  }
}

/** Detalle de una saca para la vista previa + reimpresión de etiqueta. */
export interface QrSackDetail {
  id: string;
  qrCode: string;
  status: SackStatus;
  weight: number;
  materialName: string;
  materialCode: string;
  tipoProducto: string;
  warehouseName: string | null;
  zoneName: string | null;
  /** Nº de saca dentro del contenedor (ej: 1/50). */
  batchNumber: string | null;
  /** Nº de lote de producción (solo sacas de salida). */
  lotNumber: string | null;
  /** Nº correlativo de la saca dentro de su lote; se muestra `N/LOTE`. */
  lotSequence: number | null;
  containerReference: string | null;
  billOfLading: string | null;
  /** Fecha de recepción, producción o alta manual, ya formateada (es-ES). */
  fecha: string | null;
  notes: string | null;
  createdAt: Date;
}

/** Fila resumida para la tabla «Sacas recientes». */
export interface QrRecentSack {
  id: string;
  qrCode: string;
  status: SackStatus;
  materialName: string;
  createdAt: Date;
}

function formatDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toLocaleDateString("es-ES");
}

const SACK_DETAIL_INCLUDE = {
  material: { select: { name: true, code: true } },
  zone: { select: { name: true, warehouse: { select: { name: true } } } },
  container: {
    select: {
      reference: true,
      billOfLading: true,
      arrivedAt: true,
      registeredAt: true,
    },
  },
  lot: { select: { lotNumber: true, producedAt: true } },
  stockEntry: { select: { date: true } },
} satisfies Prisma.SackInclude;

type SackWithDetail = Prisma.SackGetPayload<{
  include: typeof SACK_DETAIL_INCLUDE;
}>;

function toDetail(sack: SackWithDetail): QrSackDetail {
  const fecha =
    formatDate(sack.lot?.producedAt) ??
    formatDate(sack.container?.arrivedAt) ??
    formatDate(sack.container?.registeredAt) ??
    formatDate(sack.stockEntry?.date) ??
    formatDate(sack.createdAt);

  return {
    id: sack.id,
    qrCode: sack.qrCode,
    status: sack.status,
    weight: sack.weight,
    materialName: sack.material.name,
    materialCode: sack.material.code,
    tipoProducto: tipoProducto(sack.status),
    warehouseName: sack.zone?.warehouse.name ?? null,
    zoneName: sack.zone?.name ?? null,
    batchNumber: sack.batchNumber,
    lotNumber: sack.lot?.lotNumber ?? null,
    lotSequence: sack.lotSequence,
    containerReference: sack.container?.reference ?? null,
    billOfLading: sack.container?.billOfLading ?? null,
    fecha,
    notes: sack.notes,
    createdAt: sack.createdAt,
  };
}

/** Busca una saca por su `qrCode` (SACK-…) o por su `id`. `null` si no existe. */
export async function findSackByQrOrId(
  query: string,
): Promise<QrSackDetail | null> {
  const q = query.trim();
  if (!q) return null;

  const sack = await prisma.sack.findFirst({
    where: { OR: [{ qrCode: q }, { id: q }] },
    include: SACK_DETAIL_INCLUDE,
  });
  return sack ? toDetail(sack) : null;
}

/** Sacas creadas por un alta manual de inventario, en orden de numeración. */
export async function listStockEntrySacks(
  stockEntryId: string,
): Promise<QrSackDetail[]> {
  const sacks = await prisma.sack.findMany({
    where: { stockEntryId },
    include: SACK_DETAIL_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  // createMany deja el mismo createdAt a todas: se ordena por el «N/total».
  return sacks
    .map(toDetail)
    .sort(
      (a, b) =>
        Number(a.batchNumber?.split("/")[0] ?? 0) -
        Number(b.batchNumber?.split("/")[0] ?? 0),
    );
}

/** Datos de la etiqueta física de una saca (plantilla A5). */
export function sackLabel(sack: QrSackDetail): LabelData {
  return {
    qrCode: sack.qrCode,
    codigoProducto: sack.materialCode,
    tipoProducto: sack.tipoProducto,
    nombreProducto: sack.materialName,
    loteOSaca: sack.lotNumber
      ? formatSackNumber(sack.lotSequence, sack.lotNumber)
      : (sack.batchNumber ?? sack.id),
    contenedor: sack.containerReference ?? undefined,
    bl: sack.billOfLading ?? undefined,
    fecha: sack.fecha ?? undefined,
    pesoNetoKg: sack.weight,
    notas: sack.notes ?? undefined,
  };
}

/** Últimas sacas creadas (para la tabla «Sacas recientes»). */
export async function listRecentSacks(limit = 10): Promise<QrRecentSack[]> {
  const sacks = await prisma.sack.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      qrCode: true,
      status: true,
      createdAt: true,
      material: { select: { name: true } },
    },
  });

  return sacks.map((s) => ({
    id: s.id,
    qrCode: s.qrCode,
    status: s.status,
    materialName: s.material.name,
    createdAt: s.createdAt,
  }));
}
