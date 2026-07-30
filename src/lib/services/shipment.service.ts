import { prisma } from "@/lib/prisma";
import { createAlbaran } from "@/lib/integrations/holded";
import { getCostsConfig, type CostsConfig } from "@/lib/services/cost.service";
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

// ─── Lotes de salida disponibles (panel "Lotes de Salida") ─────────────────────

/** Estado de saca "disponible" (aún sin expedir) para cada tipo de lote. */
const LOT_TYPE_TO_SACK_STATUS: Record<LotType, SackStatus> = {
  [LotType.PRODUCTO_TERMINADO]: SackStatus.PRODUCTO_TERMINADO,
  [LotType.SUBPRODUCTO]: SackStatus.SUBPRODUCTO,
  [LotType.RECHAZO]: SackStatus.RECHAZO,
};

export interface AvailableLotSack {
  id: string;
  qrCode: string;
  materialName: string;
  weight: number;
}

/** GL-36 — desglose del coste total de un lote de salida. */
export interface LotCosts {
  /** Coste de materia prima: Σ (€/t de compra × toneladas) de las sacas de entrada. */
  material: number;
  /** Coste de procesado: Σ sacas de entrada consumidas × coste/saca. */
  processing: number;
  /** Coste de consumibles: nº sacas × (coste palé + coste saca vacía). */
  consumable: number;
  /** Suma de los tres. */
  total: number;
  /** Nº de sacas de entrada que conformaron el lote (para procesado/material). */
  inputSacks: number;
}

export interface AvailableOutputLot {
  id: string;
  lotNumber: string;
  type: LotType;
  materialName: string;
  producedAt: Date;
  /** GL-36: false = cerrado (22 sacas, listo para enviar); true = acumulando. */
  isOpen: boolean;
  /** Nº de sacas de salida en el lote (para el contador n/22). */
  sackCount: number;
  availableKg: number;
  availableSacks: number;
  costs: LotCosts;
  sacks: AvailableLotSack[];
}

export interface AvailableOutputLots {
  productoTerminado: AvailableOutputLot[];
  subproducto: AvailableOutputLot[];
  rechazo: AvailableOutputLot[];
}

/**
 * GL-36 — coste total de un lote a partir de sus sacas de salida y las sacas de
 * entrada que las conformaron (trazabilidad GL-37):
 *   · material   = Σ (€/t de compra de la saca de entrada × sus toneladas)
 *   · procesado  = nº sacas de entrada consumidas × coste/saca configurado
 *   · consumible = nº sacas de salida × (coste palé + coste saca vacía)
 */
function computeLotCosts(
  outputSacks: {
    composedOf: {
      inputSack: {
        weight: number;
        container: {
          providerShipment: {
            purchaseOrder: { pricePerTon: number | null } | null;
          } | null;
        } | null;
      };
    }[];
  }[],
  sackCount: number,
  costs: CostsConfig,
): LotCosts {
  let inputSacks = 0;
  let material = 0;
  for (const s of outputSacks) {
    for (const c of s.composedOf) {
      inputSacks += 1;
      const pricePerTon =
        c.inputSack.container?.providerShipment?.purchaseOrder?.pricePerTon ??
        0;
      material += pricePerTon * (c.inputSack.weight / 1000);
    }
  }
  const processing = inputSacks * costs.processingPerSack;
  const consumable = sackCount * (costs.palletCost + costs.emptySackCost);
  const round = (n: number): number => Math.round(n * 100) / 100;
  return {
    material: round(material),
    processing: round(processing),
    consumable: round(consumable),
    total: round(material + processing + consumable),
    inputSacks,
  };
}

const lotCostSackSelect = {
  composedOf: {
    select: {
      inputSack: {
        select: {
          weight: true,
          container: {
            select: {
              providerShipment: {
                select: { purchaseOrder: { select: { pricePerTon: true } } },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SackSelect;

/** Lotes de un tipo con sus sacas todavía disponibles (no expedidas). */
async function availableLotsByType(
  type: LotType,
  costs: CostsConfig,
): Promise<AvailableOutputLot[]> {
  const sackStatus = LOT_TYPE_TO_SACK_STATUS[type];
  const lots = await prisma.productionLot.findMany({
    where: { type, sacks: { some: { status: sackStatus } } },
    include: {
      material: { select: { name: true } },
      sacks: {
        where: { status: sackStatus },
        select: {
          id: true,
          qrCode: true,
          weight: true,
          material: { select: { name: true } },
          ...lotCostSackSelect,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    // Abiertos primero (el lote en curso arriba), luego por fecha desc.
    orderBy: [{ isOpen: "desc" }, { producedAt: "desc" }],
  });

  return lots.map((l) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    type: l.type,
    materialName: l.material.name,
    producedAt: l.producedAt,
    isOpen: l.isOpen,
    sackCount: l.sacks.length,
    availableKg:
      Math.round(l.sacks.reduce((sum, s) => sum + s.weight, 0) * 100) / 100,
    availableSacks: l.sacks.length,
    costs: computeLotCosts(l.sacks, l.sacks.length, costs),
    sacks: l.sacks.map((s) => ({
      id: s.id,
      qrCode: s.qrCode,
      materialName: s.material.name,
      weight: s.weight,
    })),
  }));
}

/**
 * Lotes de salida disponibles agrupados por tipo (Producto Terminado,
 * Subproducto, Rechazo). Alimenta la pestaña "Lotes de Salida".
 */
export async function getAvailableOutputLots(): Promise<AvailableOutputLots> {
  const costs = await getCostsConfig();
  const [productoTerminado, subproducto, rechazo] = await Promise.all([
    availableLotsByType(LotType.PRODUCTO_TERMINADO, costs),
    availableLotsByType(LotType.SUBPRODUCTO, costs),
    availableLotsByType(LotType.RECHAZO, costs),
  ]);
  return { productoTerminado, subproducto, rechazo };
}

export interface CreateShipmentInput {
  buyerId: string;
  carrierId?: string;
  vehiclePlate?: string;
  driverName?: string;
  notes?: string;
  lots: { lotId: string; weightKg: number }[];
  /** Palés retornables prestados al comprador con este envío (enlaza con Consumibles). */
  returnablePallets?: boolean;
  palletCount?: number;
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
    const shipment = await tx.shipment.create({
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

    // Palés retornables → préstamo al comprador enlazado con el envío.
    // Aparece en Consumibles (saldos de palés por comprador).
    if (input.returnablePallets && input.palletCount && input.palletCount > 0) {
      await tx.palletMovement.create({
        data: {
          buyerId: input.buyerId,
          quantity: input.palletCount, // positivo = préstamo
          condition: "OK",
          shipmentId: shipment.id,
          notes: `Palés retornables del envío ${shipment.reference}`,
        },
      });
    }

    return shipment;
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
