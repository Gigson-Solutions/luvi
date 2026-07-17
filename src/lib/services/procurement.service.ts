import { prisma } from "@/lib/prisma";
import { PurchaseOrderStatus, type Prisma } from "@prisma/client";

/**
 * Servicio de Aprovisionamiento — lógica de negocio de importaciones de MP.
 *
 * Flujo (naming validado con cliente — "Aprovisionamiento", no "Transporte"):
 *  1. Orden de compra (PurchaseOrder): proveedor + material + toneladas pedidas.
 *  2. Envíos de proveedor (ProviderShipment) asociados a la PO, con billOfLading,
 *     puerto de origen, barco (vessel), ETAs y peso. Un envío agrupa contenedores.
 *  3. Tracking de tránsito por fechas:
 *       En tránsito marítimo → Llegado a Valencia → Llegado a planta.
 *  4. Vista pivot por PO: toneladas pedidas vs enviadas vs recibidas en planta.
 *
 * Nota de esquema: PurchaseOrder.materialId es un campo suelto (sin relación),
 * por eso resolvemos el nombre del material con un mapa auxiliar.
 */

export type PurchaseOrderWithShipments = Prisma.PurchaseOrderGetPayload<{
  include: {
    supplier: true;
    providerShipments: { include: { containers: true } };
  };
}>;

export type ShipmentWithOrder = Prisma.ProviderShipmentGetPayload<{
  include: {
    purchaseOrder: { include: { supplier: true } };
    containers: true;
  };
}>;

/** Etapa de tránsito derivada de las fechas de hito del envío. */
export type TransitStage = "MARITIMO" | "VALENCIA" | "PLANTA";

export function shipmentStage(shipment: {
  arrivedValencia: Date | null;
  arrivedPlanta: Date | null;
}): TransitStage {
  if (shipment.arrivedPlanta) return "PLANTA";
  if (shipment.arrivedValencia) return "VALENCIA";
  return "MARITIMO";
}

/** Fila de la vista pivot por orden de compra. */
export interface PurchaseOrderPivot {
  order: PurchaseOrderWithShipments;
  materialName: string | null;
  orderedTons: number;
  sentTons: number;
  receivedTons: number;
  shipmentCount: number;
}

/** Toneladas a partir de kg (2 decimales). */
function toTons(kg: number): number {
  return Math.round((kg / 1000) * 100) / 100;
}

/** Mapa id→nombre de materiales para resolver el campo suelto materialId. */
async function getMaterialNameMap(): Promise<Map<string, string>> {
  const materials = await prisma.material.findMany({
    select: { id: true, name: true },
  });
  return new Map(materials.map((m) => [m.id, m.name]));
}

/** Vista pivot: por cada PO, toneladas pedidas vs enviadas vs recibidas en planta. */
export async function listPurchaseOrdersPivot(): Promise<PurchaseOrderPivot[]> {
  const [orders, materialNames] = await Promise.all([
    prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        providerShipments: { include: { containers: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getMaterialNameMap(),
  ]);

  return orders.map((order) => {
    const sentKg = order.providerShipments.reduce(
      (acc, s) => acc + (s.weightKg ?? 0),
      0,
    );
    const receivedKg = order.providerShipments.reduce(
      (acc, s) => acc + (s.arrivedPlanta ? (s.weightKg ?? 0) : 0),
      0,
    );
    return {
      order,
      materialName: order.materialId
        ? (materialNames.get(order.materialId) ?? null)
        : null,
      orderedTons: order.orderedTons,
      sentTons: toTons(sentKg),
      receivedTons: toTons(receivedKg),
      shipmentCount: order.providerShipments.length,
    };
  });
}

/** Envíos en curso o recientes, con su PO/proveedor y contenedores, para tracking. */
export function listShipments(limit = 100): Promise<ShipmentWithOrder[]> {
  return prisma.providerShipment.findMany({
    include: {
      purchaseOrder: { include: { supplier: true } },
      containers: true,
    },
    orderBy: [
      { arrivedPlanta: "asc" },
      { etaPlanta: "asc" },
      { createdAt: "desc" },
    ],
    take: limit,
  });
}

/** KPIs del módulo: toneladas en tránsito (aún no en planta) y pedidos abiertos. */
export async function getProcurementStats(): Promise<{
  tonsInTransit: number;
  openOrders: number;
}> {
  const [inTransit, openOrders] = await Promise.all([
    prisma.providerShipment.findMany({
      where: { arrivedPlanta: null },
      select: { weightKg: true },
    }),
    prisma.purchaseOrder.count({
      where: {
        status: {
          in: [
            PurchaseOrderStatus.ABIERTA,
            PurchaseOrderStatus.EN_TRANSITO,
            PurchaseOrderStatus.RECIBIDA_PARCIAL,
          ],
        },
      },
    }),
  ]);
  const transitKg = inTransit.reduce((acc, s) => acc + (s.weightKg ?? 0), 0);
  return { tonsInTransit: toTons(transitKg), openOrders };
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  materialId?: string;
  orderedTons: number;
  pricePerTon?: number;
  notes?: string;
}

/** Genera el nº de PO con formato PO-YYYYMMDD-NNN (secuencial por día). */
async function generatePoNumber(): Promise<string> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const prefix = `PO-${datePart}-`;
  const count = await prisma.purchaseOrder.count({
    where: { poNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

/** Crea una orden de compra con poNumber autogenerado. */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderWithShipments> {
  const poNumber = await generatePoNumber();
  return prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: input.supplierId,
      materialId: input.materialId ?? null,
      orderedTons: input.orderedTons,
      pricePerTon: input.pricePerTon ?? null,
      notes: input.notes ?? null,
    },
    include: {
      supplier: true,
      providerShipments: { include: { containers: true } },
    },
  });
}

export interface CreateShipmentInput {
  purchaseOrderId: string;
  billOfLading?: string;
  origin?: string;
  vessel?: string;
  etaValencia?: Date;
  etaPlanta?: Date;
  weightKg?: number;
  numContainers?: number;
  notes?: string;
}

/**
 * Crea un envío de proveedor asociado a una PO, opcionalmente con N contenedores
 * vacíos (placeholders) que luego se completan en Recepciones. Transaccional.
 * Al crear un envío, la PO pasa a EN_TRANSITO si seguía ABIERTA.
 */
export async function createProviderShipment(
  input: CreateShipmentInput,
): Promise<ShipmentWithOrder> {
  const numContainers = Math.max(0, Math.floor(input.numContainers ?? 0));

  const shipment = await prisma.$transaction(async (tx) => {
    const created = await tx.providerShipment.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        billOfLading: input.billOfLading ?? null,
        origin: input.origin ?? null,
        vessel: input.vessel ?? null,
        etaValencia: input.etaValencia ?? null,
        etaPlanta: input.etaPlanta ?? null,
        weightKg: input.weightKg ?? null,
        notes: input.notes ?? null,
      },
    });

    if (numContainers > 0) {
      const order = await tx.purchaseOrder.findUnique({
        where: { id: input.purchaseOrderId },
        select: { supplierId: true, materialId: true, poNumber: true },
      });
      if (order) {
        await tx.container.createMany({
          data: Array.from({ length: numContainers }, (_, i) => ({
            reference: `${order.poNumber}-C${String(i + 1).padStart(2, "0")}`,
            supplierId: order.supplierId,
            materialId: order.materialId,
            billOfLading: input.billOfLading ?? null,
            providerShipmentId: created.id,
          })),
        });
      }
    }

    return tx.providerShipment.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        purchaseOrder: { include: { supplier: true } },
        containers: true,
      },
    });
  });

  await recomputeOrderStatus(input.purchaseOrderId);
  return shipment;
}

/** Recalcula el estado de la PO a partir de las toneladas enviadas/recibidas. */
async function recomputeOrderStatus(purchaseOrderId: string): Promise<void> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { providerShipments: true },
  });
  if (!order || order.status === PurchaseOrderStatus.CANCELADA) return;

  const sentKg = order.providerShipments.reduce(
    (acc, s) => acc + (s.weightKg ?? 0),
    0,
  );
  const receivedTons = toTons(
    order.providerShipments.reduce(
      (acc, s) => acc + (s.arrivedPlanta ? (s.weightKg ?? 0) : 0),
      0,
    ),
  );

  let status: PurchaseOrderStatus;
  if (order.orderedTons > 0 && receivedTons >= order.orderedTons) {
    status = PurchaseOrderStatus.COMPLETADA;
  } else if (receivedTons > 0) {
    status = PurchaseOrderStatus.RECIBIDA_PARCIAL;
  } else if (sentKg > 0) {
    status = PurchaseOrderStatus.EN_TRANSITO;
  } else {
    status = PurchaseOrderStatus.ABIERTA;
  }

  if (status !== order.status) {
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { status },
    });
  }
}

/** Marca el hito "Llegado a Valencia" en un envío. */
export async function markArrivedValencia(
  shipmentId: string,
): Promise<ShipmentWithOrder> {
  const updated = await prisma.providerShipment.update({
    where: { id: shipmentId },
    data: { arrivedValencia: new Date() },
    include: {
      purchaseOrder: { include: { supplier: true } },
      containers: true,
    },
  });
  if (updated.purchaseOrderId)
    await recomputeOrderStatus(updated.purchaseOrderId);
  return updated;
}

/** Marca el hito "Llegado a planta" en un envío y recalcula el estado de la PO. */
export async function markArrivedPlanta(
  shipmentId: string,
): Promise<ShipmentWithOrder> {
  const now = new Date();
  const existing = await prisma.providerShipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { arrivedValencia: true },
  });
  const updated = await prisma.providerShipment.update({
    where: { id: shipmentId },
    data: {
      arrivedPlanta: now,
      // Si no pasó por el hito de Valencia, lo damos por cumplido también.
      arrivedValencia: existing.arrivedValencia ?? now,
    },
    include: {
      purchaseOrder: { include: { supplier: true } },
      containers: true,
    },
  });
  if (updated.purchaseOrderId)
    await recomputeOrderStatus(updated.purchaseOrderId);
  return updated;
}

/** Datos auxiliares para los formularios de aprovisionamiento. */
export async function getProcurementFormData(): Promise<{
  suppliers: { id: string; name: string; code: string }[];
  materials: { id: string; name: string; code: string }[];
  openOrders: {
    id: string;
    poNumber: string;
    supplierName: string;
    materialName: string | null;
  }[];
}> {
  const [suppliers, materials, orders, materialNames] = await Promise.all([
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        status: {
          in: [
            PurchaseOrderStatus.ABIERTA,
            PurchaseOrderStatus.EN_TRANSITO,
            PurchaseOrderStatus.RECIBIDA_PARCIAL,
          ],
        },
      },
      select: {
        id: true,
        poNumber: true,
        materialId: true,
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getMaterialNameMap(),
  ]);

  return {
    suppliers,
    materials,
    openOrders: orders.map((o) => ({
      id: o.id,
      poNumber: o.poNumber,
      supplierName: o.supplier.name,
      materialName: o.materialId
        ? (materialNames.get(o.materialId) ?? null)
        : null,
    })),
  };
}
