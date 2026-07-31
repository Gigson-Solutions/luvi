import { prisma } from "@/lib/prisma";
import { createAlbaran } from "@/lib/integrations/holded";
import { generateLotNumber } from "@/lib/utils";
import { MAX_SACKS_PER_LOT } from "@/lib/services/production.service";
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
    // Lotes con sacas disponibles y NO asignados aún a ningún envío (GL-42).
    where: {
      type,
      sacks: { some: { status: sackStatus } },
      shipmentLots: { none: {} },
    },
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

// ─── Lotes sueltos, creación manual y modificación (GL-41 / GL-39) ─────────────

export interface LooseOutputSack {
  id: string;
  qrCode: string;
  materialId: string;
  materialName: string;
  weight: number;
}

/**
 * GL-41 — sacas de salida SUELTAS de un tipo (sin lote asignado), disponibles
 * para agrupar manualmente en un lote. Subproductos/Rechazos se crean sueltos;
 * también aparecen aquí las sacas sacadas de un lote (GL-39).
 */
export function listLooseOutputSacks(
  type: LotType,
): Promise<LooseOutputSack[]> {
  const sackStatus = LOT_TYPE_TO_SACK_STATUS[type];
  return prisma.sack
    .findMany({
      where: { status: sackStatus, lotId: null },
      select: {
        id: true,
        qrCode: true,
        weight: true,
        materialId: true,
        material: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    })
    .then((sacks) =>
      sacks.map((s) => ({
        id: s.id,
        qrCode: s.qrCode,
        materialId: s.materialId,
        materialName: s.material.name,
        weight: s.weight,
      })),
    );
}

export interface LooseOutputSacks {
  productoTerminado: LooseOutputSack[];
  subproducto: LooseOutputSack[];
  rechazo: LooseOutputSack[];
}

/** GL-41 — sacas sueltas (sin lote) agrupadas por tipo, para el panel de lotes. */
export async function getLooseOutputSacks(): Promise<LooseOutputSacks> {
  const [productoTerminado, subproducto, rechazo] = await Promise.all([
    listLooseOutputSacks(LotType.PRODUCTO_TERMINADO),
    listLooseOutputSacks(LotType.SUBPRODUCTO),
    listLooseOutputSacks(LotType.RECHAZO),
  ]);
  return { productoTerminado, subproducto, rechazo };
}

/**
 * GL-41 — crea un lote de salida MANUAL agrupando sacas sueltas del mismo tipo
 * (máximo 22). Todas las sacas deben ser del tipo indicado, estar sueltas
 * (sin lote) y compartir material. Devuelve el lote creado.
 */
export async function createManualLot(
  type: LotType,
  sackIds: string[],
): Promise<{ id: string; lotNumber: string; sackCount: number }> {
  if (sackIds.length === 0) {
    throw new Error("Selecciona al menos una saca.");
  }
  if (sackIds.length > MAX_SACKS_PER_LOT) {
    throw new Error(
      `Un lote no puede tener más de ${MAX_SACKS_PER_LOT} sacas.`,
    );
  }
  const sackStatus = LOT_TYPE_TO_SACK_STATUS[type];

  return prisma.$transaction(async (tx) => {
    const sacks = await tx.sack.findMany({
      where: { id: { in: sackIds } },
      select: { id: true, status: true, lotId: true, materialId: true },
    });
    if (sacks.length !== sackIds.length) {
      throw new Error("Alguna saca no existe.");
    }
    if (sacks.some((s) => s.status !== sackStatus)) {
      throw new Error("Alguna saca no es del tipo del lote.");
    }
    if (sacks.some((s) => s.lotId !== null)) {
      throw new Error("Alguna saca ya pertenece a un lote.");
    }
    const materialId = sacks[0].materialId;
    if (sacks.some((s) => s.materialId !== materialId)) {
      throw new Error("Todas las sacas del lote deben ser del mismo material.");
    }

    const start = startOfToday();
    const countToday = await tx.productionLot.count({
      where: { producedAt: { gte: start } },
    });
    const lotNumber = generateLotNumber(new Date(), countToday + 1);
    // El lote manual se crea cerrado si llega a 22; si no, queda abierto para
    // poder añadir más sacas después.
    const lot = await tx.productionLot.create({
      data: {
        lotNumber,
        type,
        materialId,
        isOpen: sackIds.length < MAX_SACKS_PER_LOT,
        closedAt: sackIds.length >= MAX_SACKS_PER_LOT ? new Date() : null,
      },
    });
    await tx.sack.updateMany({
      where: { id: { in: sackIds } },
      data: { lotId: lot.id },
    });
    return { id: lot.id, lotNumber: lot.lotNumber, sackCount: sackIds.length };
  });
}

/**
 * GL-41 — añade sacas sueltas a un lote existente ABIERTO (sin superar 22).
 */
export async function addSacksToLot(
  lotId: string,
  sackIds: string[],
): Promise<{ sackCount: number }> {
  if (sackIds.length === 0) {
    throw new Error("Selecciona al menos una saca.");
  }
  return prisma.$transaction(async (tx) => {
    const lot = await tx.productionLot.findUniqueOrThrow({
      where: { id: lotId },
      include: { _count: { select: { sacks: true } } },
    });
    if (!lot.isOpen) {
      throw new Error("El lote está cerrado; no admite más sacas.");
    }
    const sackStatus = LOT_TYPE_TO_SACK_STATUS[lot.type];
    const sacks = await tx.sack.findMany({
      where: { id: { in: sackIds } },
      select: { id: true, status: true, lotId: true, materialId: true },
    });
    if (sacks.length !== sackIds.length)
      throw new Error("Alguna saca no existe.");
    if (sacks.some((s) => s.status !== sackStatus || s.lotId !== null)) {
      throw new Error("Alguna saca no está suelta o no es del tipo del lote.");
    }
    if (sacks.some((s) => s.materialId !== lot.materialId)) {
      throw new Error("Las sacas deben ser del mismo material que el lote.");
    }
    const nextCount = lot._count.sacks + sackIds.length;
    if (nextCount > MAX_SACKS_PER_LOT) {
      throw new Error(
        `El lote quedaría con ${nextCount} sacas (máximo ${MAX_SACKS_PER_LOT}).`,
      );
    }
    await tx.sack.updateMany({
      where: { id: { in: sackIds } },
      data: { lotId: lot.id },
    });
    if (nextCount >= MAX_SACKS_PER_LOT) {
      await tx.productionLot.update({
        where: { id: lot.id },
        data: { isOpen: false, closedAt: new Date() },
      });
    }
    return { sackCount: nextCount };
  });
}

/**
 * GL-39 — saca una saca de un lote que AÚN no está asignado a un envío. La saca
 * queda suelta (sin lote) y podrá añadirse a otro lote más adelante. Si el lote
 * se queda vacío, se elimina.
 */
export async function removeSackFromLot(sackId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sack = await tx.sack.findUniqueOrThrow({
      where: { id: sackId },
      select: { id: true, lotId: true },
    });
    if (!sack.lotId) throw new Error("La saca no pertenece a ningún lote.");

    const assigned = await tx.shipmentLot.count({
      where: { lotId: sack.lotId },
    });
    if (assigned > 0) {
      throw new Error(
        "El lote ya está asignado a un envío; no se puede modificar.",
      );
    }

    const lotId = sack.lotId;
    await tx.sack.update({ where: { id: sackId }, data: { lotId: null } });

    // Si el lote se queda sin sacas, lo eliminamos; si no, lo reabrimos para
    // poder seguir añadiendo sacas.
    const remaining = await tx.sack.count({ where: { lotId } });
    if (remaining === 0) {
      await tx.productionLot.delete({ where: { id: lotId } });
    } else {
      await tx.productionLot.update({
        where: { id: lotId },
        data: { isOpen: true, closedAt: null },
      });
    }
  });
}

export interface CreateShipmentInput {
  buyerId: string;
  carrierId?: string;
  vehiclePlate?: string;
  driverName?: string;
  notes?: string;
  /** GL-42: opcional. El envío puede crearse vacío y asignarle lotes después. */
  lots?: { lotId: string; weightKg: number }[];
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

/**
 * Paso 1 — crea el envío en estado BORRADOR (GL-42: normalmente vacío; los
 * lotes se asignan después con `assignLotToShipment`).
 */
export async function createShipment(
  input: CreateShipmentInput,
): Promise<ShipmentWithRefs> {
  const lots = input.lots ?? [];
  if (lots.some((l) => l.weightKg <= 0)) {
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
          create: lots.map((l) => ({ lotId: l.lotId, weightKg: l.weightKg })),
        },
      },
      include: shipmentInclude,
    });
  });
}

/**
 * GL-42 — asigna un lote (cerrado, listo para enviar) a un envío en BORRADOR.
 * El peso del lote se calcula con sus sacas disponibles.
 */
export async function assignLotToShipment(
  shipmentId: string,
  lotId: string,
): Promise<ShipmentWithRefs> {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: { status: true },
    });
    if (shipment.status !== ShipmentStatus.BORRADOR) {
      throw new Error("Solo se pueden asignar lotes a envíos en borrador.");
    }
    const already = await tx.shipmentLot.count({ where: { lotId } });
    if (already > 0) {
      throw new Error("Ese lote ya está asignado a un envío.");
    }
    const lot = await tx.productionLot.findUniqueOrThrow({
      where: { id: lotId },
      select: { type: true },
    });
    const sacks = await tx.sack.findMany({
      where: { lotId, status: LOT_TYPE_TO_SACK_STATUS[lot.type] },
      select: { weight: true },
    });
    const weightKg =
      Math.round(sacks.reduce((sum, s) => sum + s.weight, 0) * 100) / 100;
    await tx.shipmentLot.create({ data: { shipmentId, lotId, weightKg } });
    return tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: shipmentInclude,
    });
  });
}

/** GL-42 — quita un lote de un envío en BORRADOR (vuelve a estar disponible). */
export async function unassignLotFromShipment(
  shipmentId: string,
  lotId: string,
): Promise<ShipmentWithRefs> {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: { status: true },
    });
    if (shipment.status !== ShipmentStatus.BORRADOR) {
      throw new Error("Solo se pueden quitar lotes de envíos en borrador.");
    }
    await tx.shipmentLot.deleteMany({ where: { shipmentId, lotId } });
    return tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
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

/** Estados de saca de salida (para marcar EN_TRANSITO al expedir). */
const OUTPUT_SACK_STATUSES: SackStatus[] = [
  SackStatus.PRODUCTO_TERMINADO,
  SackStatus.SUBPRODUCTO,
  SackStatus.RECHAZO,
];

export interface ExpediteOptions {
  /** GL-42: palés retornables prestados al comprador con este envío. */
  returnablePallets?: boolean;
  palletCount?: number;
}

/**
 * Paso 3 — expide el envío (BORRADOR/CONFIRMADO → EXPEDIDO).
 * Crea el albarán en Holded, guarda holdedAlbaranId, marca las sacas de los
 * lotes como EN_TRANSITO y sella expeditedAt. Si Holded simula, continúa.
 * GL-42: al expedir se indica si los palés son retornables (préstamo al
 * comprador, enlazado con Consumibles).
 */
export async function expediteShipment(
  shipmentId: string,
  options: ExpediteOptions = {},
): Promise<{ shipment: ShipmentWithRefs; simulated: boolean }> {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { buyer: true, lots: { include: { lot: true } } },
  });

  if (
    shipment.status !== ShipmentStatus.CONFIRMADO &&
    shipment.status !== ShipmentStatus.BORRADOR
  ) {
    throw new Error("Este envío ya ha sido expedido.");
  }
  if (shipment.lots.length === 0) {
    throw new Error("Asigna al menos un lote al envío antes de expedirlo.");
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
    // Al expedir, los lotes del envío que sigan abiertos (envío parcial <22) se
    // dan por terminados: isOpen=false + closedAt (tal y como se envían).
    await tx.productionLot.updateMany({
      where: { id: { in: lotIds }, isOpen: true },
      data: { isOpen: false, closedAt: new Date() },
    });
    await tx.sack.updateMany({
      where: {
        lotId: { in: lotIds },
        status: { in: OUTPUT_SACK_STATUSES },
      },
      data: { status: SackStatus.EN_TRANSITO },
    });
    // Persistir el contacto Holded en el comprador si se creó al vuelo.
    if (!shipment.buyer.holdedId && albaran.contactId) {
      await tx.buyer.update({
        where: { id: shipment.buyerId },
        data: { holdedId: albaran.contactId },
      });
    }
    // GL-42: palés retornables → préstamo al comprador (Consumibles).
    if (
      options.returnablePallets &&
      options.palletCount &&
      options.palletCount > 0
    ) {
      await tx.palletMovement.create({
        data: {
          buyerId: shipment.buyerId,
          quantity: options.palletCount,
          condition: "OK",
          shipmentId: shipment.id,
          notes: `Palés retornables del envío ${shipment.reference}`,
        },
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
