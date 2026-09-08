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

/**
 * Costes del pedido, cada uno en su unidad natural (€/t, €/contenedor o
 * €/embarque). Todos opcionales y editables después de guardar el pedido.
 */
export interface PurchaseOrderCosts {
  /** PRECIO DE LA MERCANCÍA (€/t). Si no viene se deriva de totalPrice. */
  pricePerTon?: number | null;
  oceanFreightPerContainer?: number | null;
  arrivalCostsPerContainer?: number | null;
  arrivalCostsPerShipment?: number | null;
  deliveryTransportPerContainer?: number | null;
  additionalCostsPerShipment?: number | null;
  customsDuties?: number | null;
}

export interface CreatePurchaseOrderInput extends PurchaseOrderCosts {
  supplierId: string;
  materialId?: string;
  orderedTons: number;
  /** Puerto o país de origen del pedido. */
  originPort?: string;
  /** Precio total del pedido (€). Deriva pricePerTon = totalPrice / orderedTons. */
  totalPrice?: number;
  notes?: string;
}

/** Normaliza los costes del pedido a un objeto listo para Prisma. */
function costsData(input: PurchaseOrderCosts): {
  oceanFreightPerContainer: number | null;
  arrivalCostsPerContainer: number | null;
  arrivalCostsPerShipment: number | null;
  deliveryTransportPerContainer: number | null;
  additionalCostsPerShipment: number | null;
  customsDuties: number | null;
} {
  return {
    oceanFreightPerContainer: input.oceanFreightPerContainer ?? null,
    arrivalCostsPerContainer: input.arrivalCostsPerContainer ?? null,
    arrivalCostsPerShipment: input.arrivalCostsPerShipment ?? null,
    deliveryTransportPerContainer: input.deliveryTransportPerContainer ?? null,
    additionalCostsPerShipment: input.additionalCostsPerShipment ?? null,
    customsDuties: input.customsDuties ?? null,
  };
}

/**
 * Precio de la mercancía por tonelada: el tecleado si viene, y si no el
 * derivado del precio total (totalPrice / toneladas, 4 decimales).
 */
function resolvePricePerTon(
  input: PurchaseOrderCosts & { totalPrice?: number | null; orderedTons: number },
): number | null {
  if (input.pricePerTon != null) return input.pricePerTon;
  if (input.totalPrice != null && input.orderedTons > 0) {
    return Math.round((input.totalPrice / input.orderedTons) * 10000) / 10000;
  }
  return null;
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
  return prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: input.supplierId,
      materialId: input.materialId ?? null,
      orderedTons: input.orderedTons,
      originPort: input.originPort ?? null,
      totalPrice: input.totalPrice ?? null,
      pricePerTon: resolvePricePerTon(input),
      notes: input.notes ?? null,
      ...costsData(input),
    },
    include: {
      supplier: true,
      providerShipments: { include: { containers: true } },
    },
  });
}

export interface UpdatePurchaseOrderInput extends CreatePurchaseOrderInput {
  id: string;
}

/**
 * Edita un pedido ya creado: datos de cabecera y todos sus costes. El nº de PO
 * no cambia. El estado se deja como está (se corrige aparte).
 */
export async function updatePurchaseOrder(
  input: UpdatePurchaseOrderInput,
): Promise<PurchaseOrderWithShipments> {
  const order = await prisma.purchaseOrder.update({
    where: { id: input.id },
    data: {
      supplierId: input.supplierId,
      materialId: input.materialId ?? null,
      orderedTons: input.orderedTons,
      originPort: input.originPort ?? null,
      totalPrice: input.totalPrice ?? null,
      pricePerTon: resolvePricePerTon(input),
      notes: input.notes ?? null,
      ...costsData(input),
    },
    include: {
      supplier: true,
      providerShipments: { include: { containers: true } },
    },
  });
  // Cambiar las toneladas pedidas puede cambiar el estado (p. ej. pasa a
  // COMPLETADA), salvo que el estado esté fijado a mano.
  await recomputeOrderStatus(order.id);
  return order;
}

/**
 * Fija el estado del pedido a mano (avanzar o retroceder). A partir de aquí el
 * estado deja de recalcularse solo; se puede devolver al automático con
 * `automatic = true`.
 */
export async function setPurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
  automatic = false,
): Promise<{ id: string; status: PurchaseOrderStatus }> {
  if (automatic) {
    await prisma.purchaseOrder.update({
      where: { id },
      data: { statusManual: false },
    });
    await recomputeOrderStatus(id);
    return prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true },
    });
  }
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status, statusManual: true },
    select: { id: true, status: true },
  });
}

/**
 * Días de tránsito marítimo/terrestre por defecto (naming del negocio).
 * Conservados como referencia informativa; las ETAs ya se introducen como
 * fechas directas (GL-50).
 */
export const DEFAULT_MARITIME_DAYS = 30;
export const DEFAULT_TERRESTRIAL_DAYS = 7;

/**
 * Par contenedor: bill of lading + nº de contenedor tecleado por el usuario,
 * con su peso individual estimado en kg (GL-57).
 */
export interface ShipmentContainerInput {
  billOfLading: string;
  reference: string;
  /** Peso estimado del contenedor en kg. */
  weight?: number;
}

export interface CreateShipmentInput {
  purchaseOrderId: string;
  /** Fecha de salida de origen (opcional, informativa). */
  departureDate?: Date;
  /** Fecha de llegada a Valencia elegida por el usuario (GL-50). */
  etaValencia: Date;
  /** Fecha de llegada a planta elegida por el usuario (GL-50). */
  etaPlanta: Date;
  /** Pares BL ↔ nº de contenedor, cada uno con su peso. Mínimo 1. */
  containers: ShipmentContainerInput[];
  notes?: string;
}

/**
 * Crea un envío de proveedor asociado a una PO. Flujo GL-45 / GL-50 / GL-57:
 *  - Las ETAs (Valencia y planta) las introduce el usuario directamente como
 *    fechas (GL-50), ya no se derivan de días de tránsito.
 *  - Un Container por cada par {billOfLading, reference}, con supplier/material
 *    heredados de la PO, su peso individual (expectedWeight, GL-57) y
 *    estimatedArrival = etaPlanta → aparecen en Recepciones como pendientes de
 *    recibir con su fecha prevista.
 *  - weightKg del envío = suma de los pesos de sus contenedores (GL-57).
 * Transaccional. Al crear un envío, la PO pasa a EN_TRANSITO si seguía ABIERTA.
 */
export async function createProviderShipment(
  input: CreateShipmentInput,
): Promise<ShipmentWithOrder> {
  const { etaValencia, etaPlanta } = input;
  const totalWeightKg = input.containers.reduce(
    (acc, c) => acc + (c.weight ?? 0),
    0,
  );
  const hasWeights = input.containers.some((c) => c.weight != null);

  const shipment = await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: input.purchaseOrderId },
      select: { supplierId: true, materialId: true },
    });

    const created = await tx.providerShipment.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        billOfLading: input.containers[0]?.billOfLading ?? null,
        departureDate: input.departureDate ?? null,
        etaValencia,
        etaPlanta,
        weightKg: hasWeights ? totalWeightKg : null,
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
          expectedWeight: c.weight ?? null,
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
  // Un estado corregido a mano manda sobre el automático.
  if (
    !order ||
    order.statusManual ||
    order.status === PurchaseOrderStatus.CANCELADA
  ) {
    return;
  }

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

export interface UpdateShipmentContainerInput extends ShipmentContainerInput {
  /** Id del contenedor existente; sin él, se crea uno nuevo. */
  id?: string;
}

export interface UpdateShipmentInput {
  id: string;
  departureDate?: Date;
  etaValencia: Date;
  etaPlanta: Date;
  containers: UpdateShipmentContainerInput[];
  notes?: string;
}

/**
 * Edita un envío ya creado y arrastra los datos dependientes: los contenedores
 * (alta, edición y baja), el peso total del envío y la fecha prevista de llegada
 * que ven en Recepciones. No se borra un contenedor ya pesado o con sacas: eso
 * sería deshacer una recepción consolidada.
 */
export async function updateProviderShipment(
  input: UpdateShipmentInput,
): Promise<ShipmentWithOrder> {
  const totalWeightKg = input.containers.reduce(
    (acc, c) => acc + (c.weight ?? 0),
    0,
  );
  const hasWeights = input.containers.some((c) => c.weight != null);

  const shipment = await prisma.$transaction(async (tx) => {
    const existing = await tx.providerShipment.findUniqueOrThrow({
      where: { id: input.id },
      include: {
        containers: { include: { _count: { select: { sacks: true } } } },
      },
    });

    await tx.providerShipment.update({
      where: { id: input.id },
      data: {
        billOfLading: input.containers[0]?.billOfLading ?? null,
        departureDate: input.departureDate ?? null,
        etaValencia: input.etaValencia,
        etaPlanta: input.etaPlanta,
        weightKg: hasWeights ? totalWeightKg : null,
        notes: input.notes ?? null,
      },
    });

    const keptIds = new Set(
      input.containers.map((c) => c.id).filter((id): id is string => !!id),
    );
    for (const c of existing.containers) {
      if (keptIds.has(c.id)) continue;
      if (c.actualWeight != null || c._count.sacks > 0) {
        throw new Error(
          `El contenedor ${c.reference} ya se ha recibido: no se puede quitar del envío.`,
        );
      }
      await tx.container.delete({ where: { id: c.id } });
    }

    // Proveedor y material heredados del pedido, para los contenedores nuevos.
    const order = existing.purchaseOrderId
      ? await tx.purchaseOrder.findUniqueOrThrow({
          where: { id: existing.purchaseOrderId },
          select: { supplierId: true, materialId: true },
        })
      : null;

    for (const c of input.containers) {
      const data = {
        reference: c.reference,
        billOfLading: c.billOfLading,
        expectedWeight: c.weight ?? null,
        // La fecha prevista de recepción sigue a la ETA a planta del envío.
        estimatedArrival: input.etaPlanta,
      };
      if (c.id) {
        await tx.container.update({ where: { id: c.id }, data });
        continue;
      }
      if (!order) {
        throw new Error(
          "No se pueden añadir contenedores a un envío sin pedido asociado.",
        );
      }
      await tx.container.create({
        data: {
          ...data,
          supplierId: order.supplierId,
          materialId: order.materialId,
          providerShipmentId: existing.id,
        },
      });
    }

    return tx.providerShipment.findUniqueOrThrow({
      where: { id: input.id },
      include: {
        purchaseOrder: { include: { supplier: true } },
        containers: true,
      },
    });
  });

  if (shipment.purchaseOrderId)
    await recomputeOrderStatus(shipment.purchaseOrderId);
  return shipment;
}

/**
 * Fija la etapa de tránsito de un envío, hacia delante o hacia atrás. Ninguna
 * llegada es irreversible: volver a MARITIMO limpia las dos fechas de llegada.
 */
export async function setShipmentStage(
  shipmentId: string,
  stage: TransitStage,
): Promise<ShipmentWithOrder> {
  const now = new Date();
  const existing = await prisma.providerShipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { arrivedValencia: true, arrivedPlanta: true },
  });

  const data =
    stage === "MARITIMO"
      ? { arrivedValencia: null, arrivedPlanta: null }
      : stage === "VALENCIA"
        ? {
            arrivedValencia: existing.arrivedValencia ?? now,
            arrivedPlanta: null,
          }
        : {
            arrivedValencia: existing.arrivedValencia ?? now,
            arrivedPlanta: existing.arrivedPlanta ?? now,
          };

  const updated = await prisma.providerShipment.update({
    where: { id: shipmentId },
    data,
    include: {
      purchaseOrder: { include: { supplier: true } },
      containers: true,
    },
  });
  if (updated.purchaseOrderId)
    await recomputeOrderStatus(updated.purchaseOrderId);
  return updated;
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
