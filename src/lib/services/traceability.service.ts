import { prisma } from "@/lib/prisma";
import {
  type SackStatus,
  type LotType,
  type ShipmentStatus,
} from "@prisma/client";

/**
 * Servicio de Trazabilidad — recorrido del grafo de una saca en ambos sentidos.
 *
 * Cadena de trazabilidad:
 *  - Hacia atrás (origen):
 *      · Saca de entrada  → Container → Supplier (fechas de recepción).
 *      · Saca de salida   → ProductionLot → Transformation → sacas de entrada
 *        consumidas → sus contenedores/proveedores.
 *  - Hacia adelante (destino):
 *      · Saca de entrada  → Transformation → Lote producido → Shipment → Buyer.
 *      · Saca de salida   → Lote → Shipment → Buyer (o saca expedida directa).
 *
 * Toda la lógica de recorrido vive aquí; los componentes solo pintan los DTOs.
 */

// ─── DTOs planos (sin exponer tipos Prisma a la UI) ─────────────────────────────

export interface TraceSack {
  id: string;
  qrCode: string;
  status: SackStatus;
  weight: number;
  materialName: string;
  materialCode: string;
  zoneName: string | null;
  warehouseName: string | null;
  batchNumber: string | null;
  isOutput: boolean; // saca de salida (PT / Subproducto / Rechazo)
  createdAt: Date;
}

export interface TraceContainer {
  id: string;
  reference: string;
  supplierName: string;
  supplierCode: string;
  registeredAt: Date | null;
  arrivedAt: Date | null;
}

export interface TraceLot {
  id: string;
  lotNumber: string;
  type: LotType;
  producedAt: Date;
}

export interface TraceInputSack {
  id: string;
  qrCode: string;
  weight: number;
  materialName: string;
  status: SackStatus;
  container: TraceContainer | null;
}

/** Saca navegable (padre / hijo / relacionada) — clic → nueva traza. */
export interface TraceRelatedSack {
  id: string;
  qrCode: string;
  weight: number;
  materialName: string;
  status: SackStatus;
  isOutput: boolean;
}

export interface TraceTransformation {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  inputs: TraceInputSack[];
}

export interface TraceShipment {
  id: string;
  reference: string;
  status: ShipmentStatus;
  buyerName: string;
  buyerCode: string;
  expeditedAt: Date | null;
  deliveredAt: Date | null;
  via: "lote" | "saca"; // cómo llegó la saca al envío
}

export interface SackTrace {
  sack: TraceSack;

  // ── Hacia atrás (origen) ──
  /** Contenedor de origen — solo sacas de entrada. */
  originContainer: TraceContainer | null;
  /** Lote de producción del que procede — solo sacas de salida. */
  originLot: TraceLot | null;
  /** Transformaciones que produjeron el lote y sacas de entrada consumidas. */
  originTransformations: TraceTransformation[];

  // ── Hacia adelante (destino) ──
  /** Lotes producidos a partir de esta saca de entrada. */
  producedLots: TraceLot[];
  /** Envíos donde acabó la saca (directa o vía lote). */
  shipments: TraceShipment[];

  // ── Navegación por sacas (padres / hijos / relacionadas) ──
  /** Padres: sacas de entrada que se transformaron en esta (solo sacas de salida). */
  parents: TraceRelatedSack[];
  /** Hijos: sacas finales producidas a partir de esta (solo sacas de entrada). */
  children: TraceRelatedSack[];
  /** Relacionadas: hermanas del mismo lote o de la misma transformación. */
  related: TraceRelatedSack[];
}

// ─── Helpers de mapeo ───────────────────────────────────────────────────────────

const OUTPUT_STATUSES: ReadonlySet<SackStatus> = new Set<SackStatus>([
  "PRODUCTO_TERMINADO",
  "SUBPRODUCTO",
  "RECHAZO",
]);

function mapContainer(
  container: {
    id: string;
    reference: string;
    registeredAt: Date | null;
    arrivedAt: Date | null;
    supplier: { name: string; code: string };
  } | null,
): TraceContainer | null {
  if (!container) return null;
  return {
    id: container.id,
    reference: container.reference,
    supplierName: container.supplier.name,
    supplierCode: container.supplier.code,
    registeredAt: container.registeredAt,
    arrivedAt: container.arrivedAt,
  };
}

// ─── Recorrido principal ────────────────────────────────────────────────────────

/**
 * Busca una saca por `qrCode` o por `id` y devuelve su cadena de trazabilidad
 * completa (origen + destino). Devuelve `null` si no existe.
 */
export async function traceSack(query: string): Promise<SackTrace | null> {
  const q = query.trim();
  if (!q) return null;

  const sack = await prisma.sack.findFirst({
    where: { OR: [{ qrCode: q }, { id: q }] },
    include: {
      material: { select: { name: true, code: true } },
      zone: { select: { name: true, warehouse: { select: { name: true } } } },
      container: {
        select: {
          id: true,
          reference: true,
          registeredAt: true,
          arrivedAt: true,
          supplier: { select: { name: true, code: true } },
        },
      },
      lot: {
        select: { id: true, lotNumber: true, type: true, producedAt: true },
      },
      // Envíos donde la saca se expidió individualmente.
      shipmentSacks: {
        include: {
          shipment: {
            select: {
              id: true,
              reference: true,
              status: true,
              expeditedAt: true,
              deliveredAt: true,
              buyer: { select: { name: true, code: true } },
            },
          },
        },
      },
      // Transformaciones donde esta saca de entrada fue consumida.
      transformationInputs: {
        include: {
          transformation: {
            select: {
              lot: {
                select: {
                  id: true,
                  lotNumber: true,
                  type: true,
                  producedAt: true,
                  shipmentLots: {
                    include: {
                      shipment: {
                        select: {
                          id: true,
                          reference: true,
                          status: true,
                          expeditedAt: true,
                          deliveredAt: true,
                          buyer: { select: { name: true, code: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sack) return null;

  const isOutput = sack.lotId != null || OUTPUT_STATUSES.has(sack.status);

  const traceSackDto: TraceSack = {
    id: sack.id,
    qrCode: sack.qrCode,
    status: sack.status,
    weight: sack.weight,
    materialName: sack.material.name,
    materialCode: sack.material.code,
    zoneName: sack.zone?.name ?? null,
    warehouseName: sack.zone?.warehouse.name ?? null,
    batchNumber: sack.batchNumber,
    isOutput,
    createdAt: sack.createdAt,
  };

  // ── Hacia atrás: origen ──
  const originContainer = mapContainer(sack.container);
  const originLot: TraceLot | null = sack.lot
    ? {
        id: sack.lot.id,
        lotNumber: sack.lot.lotNumber,
        type: sack.lot.type,
        producedAt: sack.lot.producedAt,
      }
    : null;

  let originTransformations: TraceTransformation[] = [];
  if (sack.lotId) {
    const transformations = await prisma.transformation.findMany({
      where: { lotId: sack.lotId },
      orderBy: { startedAt: "asc" },
      include: {
        inputs: {
          include: {
            sack: {
              select: {
                id: true,
                qrCode: true,
                weight: true,
                status: true,
                material: { select: { name: true } },
                container: {
                  select: {
                    id: true,
                    reference: true,
                    registeredAt: true,
                    arrivedAt: true,
                    supplier: { select: { name: true, code: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    originTransformations = transformations.map((t) => ({
      id: t.id,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      inputs: t.inputs.map((inp) => ({
        id: inp.sack.id,
        qrCode: inp.sack.qrCode,
        weight: inp.sack.weight,
        materialName: inp.sack.material.name,
        status: inp.sack.status,
        container: mapContainer(inp.sack.container),
      })),
    }));
  }

  // ── Hacia adelante: destino ──
  const shipmentsById = new Map<string, TraceShipment>();

  // 1) Envíos por saca (expedición individual).
  for (const ss of sack.shipmentSacks) {
    const s = ss.shipment;
    shipmentsById.set(s.id, {
      id: s.id,
      reference: s.reference,
      status: s.status,
      buyerName: s.buyer.name,
      buyerCode: s.buyer.code,
      expeditedAt: s.expeditedAt,
      deliveredAt: s.deliveredAt,
      via: "saca",
    });
  }

  // 2) Envíos por lote — saca de salida expedida dentro de su lote.
  const producedLotsById = new Map<string, TraceLot>();

  const addLotShipments = (
    shipmentLots: {
      shipment: {
        id: string;
        reference: string;
        status: ShipmentStatus;
        expeditedAt: Date | null;
        deliveredAt: Date | null;
        buyer: { name: string; code: string };
      };
    }[],
  ): void => {
    for (const sl of shipmentLots) {
      const s = sl.shipment;
      if (shipmentsById.has(s.id)) continue;
      shipmentsById.set(s.id, {
        id: s.id,
        reference: s.reference,
        status: s.status,
        buyerName: s.buyer.name,
        buyerCode: s.buyer.code,
        expeditedAt: s.expeditedAt,
        deliveredAt: s.deliveredAt,
        via: "lote",
      });
    }
  };

  // Saca de salida: su propio lote y los envíos de ese lote.
  if (sack.lotId) {
    const lotWithShipments = await prisma.productionLot.findUnique({
      where: { id: sack.lotId },
      select: {
        shipmentLots: {
          include: {
            shipment: {
              select: {
                id: true,
                reference: true,
                status: true,
                expeditedAt: true,
                deliveredAt: true,
                buyer: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
    });
    if (lotWithShipments) addLotShipments(lotWithShipments.shipmentLots);
  }

  // Saca de entrada: lotes que alimentó + envíos de esos lotes.
  for (const inp of sack.transformationInputs) {
    const lot = inp.transformation.lot;
    if (!producedLotsById.has(lot.id)) {
      producedLotsById.set(lot.id, {
        id: lot.id,
        lotNumber: lot.lotNumber,
        type: lot.type,
        producedAt: lot.producedAt,
      });
    }
    addLotShipments(lot.shipmentLots);
  }

  const shipments = Array.from(shipmentsById.values()).sort((a, b) =>
    a.reference.localeCompare(b.reference),
  );

  // ── Navegación por sacas: padres / hijos / relacionadas ──
  const relatedSelect = {
    id: true,
    qrCode: true,
    weight: true,
    status: true,
    lotId: true,
    material: { select: { name: true } },
  } as const;

  const toRelated = (s: {
    id: string;
    qrCode: string;
    weight: number;
    status: SackStatus;
    lotId: string | null;
    material: { name: string };
  }): TraceRelatedSack => ({
    id: s.id,
    qrCode: s.qrCode,
    weight: s.weight,
    materialName: s.material.name,
    status: s.status,
    isOutput: s.lotId != null || OUTPUT_STATUSES.has(s.status),
  });

  const parents: TraceRelatedSack[] = [];
  let children: TraceRelatedSack[] = [];
  let related: TraceRelatedSack[] = [];

  if (isOutput) {
    // Padres: sacas de entrada consumidas para producir su lote.
    const seenParents = new Set<string>();
    for (const t of originTransformations) {
      for (const inp of t.inputs) {
        if (seenParents.has(inp.id)) continue;
        seenParents.add(inp.id);
        parents.push({
          id: inp.id,
          qrCode: inp.qrCode,
          weight: inp.weight,
          materialName: inp.materialName,
          status: inp.status,
          isOutput: false,
        });
      }
    }
    // Relacionadas: hermanas del mismo lote de salida.
    if (sack.lotId) {
      const siblings = await prisma.sack.findMany({
        where: { lotId: sack.lotId, id: { not: sack.id } },
        select: relatedSelect,
        orderBy: { qrCode: "asc" },
      });
      related = siblings.map(toRelated);
    }
  } else {
    // Hijos: sacas finales producidas a partir de los lotes que alimentó.
    const producedLotIds = Array.from(producedLotsById.keys());
    if (producedLotIds.length > 0) {
      const outputs = await prisma.sack.findMany({
        where: { lotId: { in: producedLotIds } },
        select: relatedSelect,
        orderBy: { qrCode: "asc" },
      });
      children = outputs.map(toRelated);
    }
    // Relacionadas: otras sacas de entrada consumidas en las mismas transformaciones.
    const txs = await prisma.transformation.findMany({
      where: { inputs: { some: { sackId: sack.id } } },
      select: { inputs: { select: { sack: { select: relatedSelect } } } },
    });
    const seenRel = new Set<string>([sack.id]);
    for (const t of txs) {
      for (const inp of t.inputs) {
        if (seenRel.has(inp.sack.id)) continue;
        seenRel.add(inp.sack.id);
        related.push(toRelated(inp.sack));
      }
    }
  }

  return {
    sack: traceSackDto,
    originContainer,
    originLot,
    originTransformations,
    producedLots: Array.from(producedLotsById.values()),
    shipments,
    parents,
    children,
    related,
  };
}
