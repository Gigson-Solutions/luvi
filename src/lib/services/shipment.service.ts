import { prisma } from "@/lib/prisma";
import { createAlbaran } from "@/lib/integrations/holded";
import {
  LotType,
  SackStatus,
  ShipmentStatus,
  type Prisma,
} from "@prisma/client";

/**
 * Servicio de Expediciones — lógica de negocio sobre Shipment + ShipmentLot.
 *
 * Flujo (naming validado con cliente):
 *  1. Crear envío (BORRADOR): comprador + transportista + lotes de Producto
 *     Terminado con su peso.
 *  2. Confirmar (BORRADOR → CONFIRMADO).
 *  3. Expedir (CONFIRMADO → EXPEDIDO): genera albarán en Holded, marca las
 *     sacas de esos lotes como EN_TRANSITO y sella expeditedAt.
 *  4. Entregar (EXPEDIDO → ENTREGADO): sacas ENTREGADA y sella deliveredAt.
 *
 * Holded NO es fuente de verdad del inventario: la app manda.
 */

export type ShipmentWithRefs = Prisma.ShipmentGetPayload<{
  include: {
    buyer: true;
    carrier: true;
    lots: { include: { lot: { include: { material: true } } } };
  };
}>;

const shipmentInclude = {
  buyer: true,
  carrier: true,
  lots: { include: { lot: { include: { material: true } } } },
} satisfies Prisma.ShipmentInclude;

/** Lista envíos, opcionalmente filtrados por estado. */
export function listShipments(
  status?: ShipmentStatus,
): Promise<ShipmentWithRefs[]> {
  return prisma.shipment.findMany({
    where: status ? { status } : undefined,
    include: shipmentInclude,
    orderBy: { createdAt: "desc" },
  });
}

export interface ShipmentStats {
  byStatus: Record<ShipmentStatus, number>;
  kgExpedited: number;
}

/** StatCards: nº de envíos por estado + kg ya expedidos. */
export async function getShipmentStats(): Promise<ShipmentStats> {
  const [grouped, agg] = await Promise.all([
    prisma.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.shipmentLot.aggregate({
      _sum: { weightKg: true },
      where: { shipment: { expeditedAt: { not: null } } },
    }),
  ]);

  const byStatus: Record<ShipmentStatus, number> = {
    BORRADOR: 0,
    CONFIRMADO: 0,
    EXPEDIDO: 0,
    ENTREGADO: 0,
  };
  for (const g of grouped) {
    byStatus[g.status] = g._count._all;
  }

  return { byStatus, kgExpedited: agg._sum.weightKg ?? 0 };
}

export interface AvailableLot {
  id: string;
  lotNumber: string;
  materialName: string;
  availableKg: number;
  availableSacks: number;
}

/** Datos auxiliares para el formulario de creación de envíos. */
export async function getShipmentFormData(): Promise<{
  buyers: { id: string; name: string; code: string }[];
  carriers: { id: string; name: string }[];
  lots: AvailableLot[];
}> {
  const [buyers, carriers, lots] = await Promise.all([
    prisma.buyer.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.carrier.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.productionLot.findMany({
      where: {
        type: LotType.PRODUCTO_TERMINADO,
        sacks: { some: { status: SackStatus.PRODUCTO_TERMINADO } },
      },
      include: {
        material: { select: { name: true } },
        sacks: {
          where: { status: SackStatus.PRODUCTO_TERMINADO },
          select: { weight: true },
        },
      },
      orderBy: { producedAt: "desc" },
    }),
  ]);

  return {
    buyers,
    carriers,
    lots: lots.map((l) => ({
      id: l.id,
      lotNumber: l.lotNumber,
      materialName: l.material.name,
      availableKg:
        Math.round(l.sacks.reduce((sum, s) => sum + s.weight, 0) * 100) / 100,
      availableSacks: l.sacks.length,
    })),
  };
}

export interface CreateShipmentInput {
  buyerId: string;
  carrierId?: string;
  vehiclePlate?: string;
  driverName?: string;
  notes?: string;
  lots: { lotId: string; weightKg: number }[];
}

/** Genera una referencia autogenerada tipo EXP-YYMMDD-NNN (secuencial diario). */
async function nextReference(tx: Prisma.TransactionClient): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `EXP-${yy}${mm}${dd}`;
  const count = await tx.shipment.count({
    where: { reference: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

/** Paso 1 — crea el envío en estado BORRADOR con sus lotes. */
export async function createShipment(
  input: CreateShipmentInput,
): Promise<ShipmentWithRefs> {
  if (input.lots.length === 0) {
    throw new Error("Añade al menos un lote al envío.");
  }
  if (input.lots.some((l) => l.weightKg <= 0)) {
    throw new Error("El peso de cada lote debe ser mayor que 0.");
  }

  return prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx);
    return tx.shipment.create({
      data: {
        reference,
        status: ShipmentStatus.BORRADOR,
        buyerId: input.buyerId,
        carrierId: input.carrierId ?? null,
        vehiclePlate: input.vehiclePlate ?? null,
        driverName: input.driverName ?? null,
        notes: input.notes ?? null,
        lots: {
          create: input.lots.map((l) => ({
            lotId: l.lotId,
            weightKg: l.weightKg,
          })),
        },
      },
      include: shipmentInclude,
    });
  });
}

/** Paso 2 — confirma el envío (BORRADOR → CONFIRMADO). */
export async function confirmShipment(
  shipmentId: string,
): Promise<ShipmentWithRefs> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
  });
  if (shipment.status !== ShipmentStatus.BORRADOR) {
    throw new Error("Solo se pueden confirmar envíos en borrador.");
  }
  return prisma.shipment.update({
    where: { id: shipmentId },
    data: { status: ShipmentStatus.CONFIRMADO },
    include: shipmentInclude,
  });
}

/**
 * Paso 3 — expide el envío (CONFIRMADO → EXPEDIDO).
 * Crea el albarán en Holded, guarda holdedAlbaranId, marca las sacas de los
 * lotes como EN_TRANSITO y sella expeditedAt. Si Holded simula, continúa.
 */
export async function expediteShipment(
  shipmentId: string,
): Promise<{ shipment: ShipmentWithRefs; simulated: boolean }> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { buyer: true, lots: { include: { lot: true } } },
  });

  if (shipment.status !== ShipmentStatus.CONFIRMADO) {
    throw new Error("Solo se pueden expedir envíos confirmados.");
  }

  const albaran = await createAlbaran({
    contactHoldedId: shipment.buyer.holdedId,
    buyerName: shipment.buyer.name,
    reference: shipment.reference,
    lines: shipment.lots.map((sl) => ({
      name: sl.lot.lotNumber,
      units: sl.weightKg,
    })),
    notes: shipment.notes ?? undefined,
  });

  if (!albaran.ok) {
    throw new Error(
      `No se pudo generar el albarán en Holded: ${albaran.error ?? "error"}`,
    );
  }

  const lotIds = shipment.lots.map((sl) => sl.lotId);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.sack.updateMany({
      where: { lotId: { in: lotIds }, status: SackStatus.PRODUCTO_TERMINADO },
      data: { status: SackStatus.EN_TRANSITO },
    });
    // Persistir el contacto Holded en el comprador si se creó al vuelo.
    if (!shipment.buyer.holdedId && albaran.contactId) {
      await tx.buyer.update({
        where: { id: shipment.buyerId },
        data: { holdedId: albaran.contactId },
      });
    }
    return tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: ShipmentStatus.EXPEDIDO,
        holdedAlbaranId: albaran.holdedId ?? null,
        expeditedAt: new Date(),
      },
      include: shipmentInclude,
    });
  });

  return { shipment: updated, simulated: albaran.simulated };
}

/** Paso 4 — marca el envío como entregado (EXPEDIDO → ENTREGADO). */
export async function deliverShipment(
  shipmentId: string,
): Promise<ShipmentWithRefs> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { lots: true },
  });

  if (shipment.status !== ShipmentStatus.EXPEDIDO) {
    throw new Error("Solo se pueden entregar envíos expedidos.");
  }

  const lotIds = shipment.lots.map((sl) => sl.lotId);

  return prisma.$transaction(async (tx) => {
    await tx.sack.updateMany({
      where: { lotId: { in: lotIds }, status: SackStatus.EN_TRANSITO },
      data: { status: SackStatus.ENTREGADA },
    });
    return tx.shipment.update({
      where: { id: shipmentId },
      data: { status: ShipmentStatus.ENTREGADO, deliveredAt: new Date() },
      include: shipmentInclude,
    });
  });
}
