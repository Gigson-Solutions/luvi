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
  /** Toneladas pedidas pendientes de recibir en planta (nunca negativo). */
  pendingTons: number;
  shipmentCount: number;
  /** ETA a planta más próxima entre los envíos aún no llegados (o null). */
  nextEtaPlanta: Date | null;
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
export async function listPurchaseOrdersPivot(
  status?: PurchaseOrderStatus,
): Promise<PurchaseOrderPivot[]> {
  const [orders, materialNames] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: status ? { status } : undefined,
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
    const receivedTons = toTons(receivedKg);
    const nextEtaPlanta =
      order.providerShipments
        .filter((s) => !s.arrivedPlanta && s.etaPlanta)
        .map((s) => s.etaPlanta as Date)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      order,
      materialName: order.materialId
        ? (materialNames.get(order.materialId) ?? null)
        : null,
      orderedTons: order.orderedTons,
      sentTons: toTons(sentKg),
      receivedTons,
      pendingTons: Math.max(
        0,
        Math.round((order.orderedTons - receivedTons) * 100) / 100,
      ),
      shipmentCount: order.providerShipments.length,
      nextEtaPlanta,
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

export interface ProcurementStats {
  /** Nº de órdenes de compra por estado. */
  byStatus: Record<PurchaseOrderStatus, number>;
  /** Toneladas enviadas aún no recibidas en planta ("Por llegar"). */
  tonsInTransit: number;
  openOrders: number;
  /** Nº total de órdenes de compra (todas). */
  orderCount: number;
  /** Σ toneladas pedidas en todas las órdenes. */
  totalOrderedTons: number;
  /** Σ toneladas enviadas (peso de todos los envíos). */
  totalSentTons: number;
  /** Σ toneladas recibidas en planta. */
  totalReceivedTons: number;
}

/**
 * KPIs del módulo. Además del desglose de órdenes por estado, expone los
 * agregados de tonelaje (pedido / enviado / en tránsito / recibido) que
 * alimentan las tarjetas principales de la cabecera.
 */
export async function getProcurementStats(): Promise<ProcurementStats> {
  const [grouped, orderAgg, shipments] = await Promise.all([
    prisma.purchaseOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.purchaseOrder.aggregate({
      _sum: { orderedTons: true },
      _count: true,
    }),
    prisma.providerShipment.findMany({
      select: { weightKg: true, arrivedPlanta: true },
    }),
  ]);

  const byStatus: Record<PurchaseOrderStatus, number> = {
    ABIERTA: 0,
    EN_TRANSITO: 0,
    RECIBIDA_PARCIAL: 0,
    COMPLETADA: 0,
    CANCELADA: 0,
  };
  for (const g of grouped) {
    byStatus[g.status] = g._count._all;
  }

  const openOrders =
    byStatus.ABIERTA + byStatus.EN_TRANSITO + byStatus.RECIBIDA_PARCIAL;

  const sentKg = shipments.reduce((acc, s) => acc + (s.weightKg ?? 0), 0);
  const receivedKg = shipments.reduce(
    (acc, s) => acc + (s.arrivedPlanta ? (s.weightKg ?? 0) : 0),
    0,
  );

  return {
    byStatus,
    tonsInTransit: toTons(sentKg - receivedKg),
    openOrders,
    orderCount: orderAgg._count,
    totalOrderedTons: orderAgg._sum.orderedTons ?? 0,
    totalSentTons: toTons(sentKg),
    totalReceivedTons: toTons(receivedKg),
  };
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  materialId?: string;
  orderedTons: number;
  /** Puerto o país de origen del pedido. */
  originPort?: string;
  /** Precio total del pedido (€). Deriva pricePerTon = totalPrice / orderedTons. */
  totalPrice?: number;
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

/** Crea una orden de compra con poNumber autogenerado.
 *  El precio por tonelada se deriva del precio total: pricePerTon =
 *  totalPrice / orderedTons (4 decimales) cuando hay precio total y toneladas>0. */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderWithShipments> {
  const poNumber = await generatePoNumber();
  const pricePerTon =
    input.totalPrice != null && input.orderedTons > 0
      ? Math.round((input.totalPrice / input.orderedTons) * 10000) / 10000
      : null;
  return prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: input.supplierId,
      materialId: input.materialId ?? null,
      orderedTons: input.orderedTons,
      originPort: input.originPort ?? null,
      totalPrice: input.totalPrice ?? null,
      pricePerTon,
      notes: input.notes ?? null,
    },
    include: {
      supplier: true,
      providerShipments: { include: { containers: true } },
    },
  });
}

/** Milisegundos en un día, para el cálculo de ETAs. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días de tránsito marítimo/terrestre por defecto (naming del negocio). */
export const DEFAULT_MARITIME_DAYS = 30;
export const DEFAULT_TERRESTRIAL_DAYS = 7;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Par contenedor: bill of lading + nº de contenedor tecleado por el usuario. */
export interface ShipmentContainerInput {
  billOfLading: string;
  reference: string;
}

export interface CreateShipmentInput {
  purchaseOrderId: string;
  /** Fecha de salida de origen — base del cálculo de ETAs. */
  departureDate: Date;
  /** Días de tránsito marítimo (default 30). */
  maritimeDays?: number;
  /** Días de tránsito terrestre Valencia → planta (default 7). */
  terrestrialDays?: number;
  /** Pares BL ↔ nº de contenedor. Mínimo 1. */
  containers: ShipmentContainerInput[];
  weightKg?: number;
  notes?: string;
}

/**
 * Crea un envío de proveedor asociado a una PO. Flujo GL-45:
 *  - ETAs derivadas de la fecha de salida:
 *      etaValencia = salida + díasMarítimos
 *      etaPlanta   = salida + díasMarítimos + díasTerrestres
 *  - Un Container por cada par {billOfLading, reference}, con supplier/material
 *    heredados de la PO y estimatedArrival = etaPlanta → aparecen en Recepciones
 *    como pendientes de recibir con su fecha prevista.
 * Transaccional. Al crear un envío, la PO pasa a EN_TRANSITO si seguía ABIERTA.
 */
export async function createProviderShipment(
  input: CreateShipmentInput,
): Promise<ShipmentWithOrder> {
  const maritimeDays = input.maritimeDays ?? DEFAULT_MARITIME_DAYS;
  const terrestrialDays = input.terrestrialDays ?? DEFAULT_TERRESTRIAL_DAYS;
  const etaValencia = addDays(input.departureDate, maritimeDays);
  const etaPlanta = addDays(
    input.departureDate,
    maritimeDays + terrestrialDays,
  );

  const shipment = await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: input.purchaseOrderId },
      select: { supplierId: true, materialId: true },
    });

    const created = await tx.providerShipment.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        billOfLading: input.containers[0]?.billOfLading ?? null,
        departureDate: input.departureDate,
        maritimeDays,
        terrestrialDays,
        etaValencia,
        etaPlanta,
        weightKg: input.weightKg ?? null,
        notes: input.notes ?? null,
      },
    });

    for (const c of input.containers) {
      await tx.container.create({
        data: {
          reference: c.reference,
          billOfLading: c.billOfLading,
          supplierId: order.supplierId,
          materialId: order.materialId,
          providerShipmentId: created.id,
          estimatedArrival: etaPlanta,
        },
      });
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
