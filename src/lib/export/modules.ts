import {
  LotType,
  PurchaseOrderStatus,
  SackStatus,
  ShipmentStatus,
} from "@prisma/client";
import type { Module } from "@/lib/permissions";
import {
  SACK_LABELS,
  SHIPMENT_LABELS,
  PO_LABELS,
} from "@/components/ui/status-badge";
import { sackTypeLabel } from "@/lib/reception-sack-types";
import { parseProductionPeriod } from "@/lib/shifts";
import { listSacks } from "@/lib/services/warehouse.service";
import {
  listHopperSacks,
  listOutputSacksByType,
} from "@/lib/services/production.service";
import {
  listPendingContainers,
  listReceivedContainers,
} from "@/lib/services/reception.service";
import {
  listConsumables,
  listBuyerPalletBalances,
  listPalletMovements,
  getLastPurchaseByConsumable,
  CONSUMABLE_TYPE_LABELS,
} from "@/lib/services/consumable.service";
import {
  listPurchaseOrdersPivot,
  shipmentStage,
} from "@/lib/services/procurement.service";
import {
  listShipments,
  getAvailableOutputLots,
  getLooseOutputSacks,
  type AvailableOutputLot,
} from "@/lib/services/shipment.service";
import {
  NUM,
  xDate,
  xDateTime,
  type ExportFile,
  type SheetSpec,
} from "@/lib/export/xlsx";

/**
 * Exportación a Excel de cada módulo. Cada función recibe los mismos
 * parámetros de URL que su página y devuelve las filas con esos filtros
 * aplicados, sin paginar.
 */

/** Tope de filas por exportación (sin paginar, pero acotado). */
const EXPORT_LIMIT = 50_000;

type Builder = (params: URLSearchParams) => Promise<ExportFile>;

const LOT_TYPE_LABELS: Record<LotType, string> = {
  PRODUCTO_TERMINADO: "Producto Terminado",
  SUBPRODUCTO: "Subproducto",
  RECHAZO: "Rechazo",
};

const LOT_STATE_LABELS: Record<AvailableOutputLot["state"], string> = {
  abierto: "Abierto",
  listo: "Listo",
  asignado: "Asignado",
};

const STAGE_LABELS: Record<ReturnType<typeof shipmentStage>, string> = {
  MARITIMO: "En tránsito marítimo",
  VALENCIA: "Llegado a Valencia",
  PLANTA: "Llegado a planta",
};

function param(params: URLSearchParams, key: string): string | undefined {
  return params.get(key)?.trim() || undefined;
}

// ─── Almacén ─────────────────────────────────────────────────────────────────

const almacen: Builder = async (params) => {
  const status = param(params, "status");
  const sacks = await listSacks(
    {
      // Igual que la página: por defecto solo materia prima ubicada.
      status: (Object.values(SackStatus) as string[]).includes(status ?? "")
        ? (status as SackStatus)
        : SackStatus.EN_ALMACEN,
      materialId: param(params, "material"),
      zoneId: param(params, "zone"),
      search: param(params, "q"),
    },
    EXPORT_LIMIT,
  );
  return {
    filename: "almacen",
    sheets: [
      {
        name: "Sacas",
        columns: [
          { header: "QR", key: "qr", width: 18 },
          { header: "Material", key: "material", width: 24 },
          { header: "Peso (kg)", key: "weight", numFmt: NUM.kg },
          { header: "Estado", key: "status", width: 18 },
          { header: "Almacén", key: "warehouse", width: 18 },
          { header: "Zona", key: "zone", width: 14 },
          { header: "Lote", key: "lot", width: 14 },
          { header: "Contenedor", key: "container", width: 18 },
          { header: "Alta", key: "createdAt", width: 18 },
        ],
        rows: sacks.map((s) => ({
          qr: s.qrCode,
          material: s.material.name,
          weight: s.weight,
          status: SACK_LABELS[s.status],
          warehouse: s.zone?.warehouse.name,
          zone: s.zone?.name,
          lot: s.lot?.lotNumber,
          container: s.container?.reference,
          createdAt: xDateTime(s.createdAt),
        })),
      },
    ],
  };
};

// ─── Producción ──────────────────────────────────────────────────────────────

const OUTPUT_TABS: Record<string, LotType> = {
  pt: LotType.PRODUCTO_TERMINADO,
  subproducto: LotType.SUBPRODUCTO,
  rechazo: LotType.RECHAZO,
};

const produccion: Builder = async (params) => {
  const period = parseProductionPeriod({
    dia: param(params, "dia"),
    turno: param(params, "turno"),
  });
  // produccion_pt_2026-09-30_noche.xlsx
  const suffix = [period.day, period.shift].filter(Boolean).join("_");
  const type = OUTPUT_TABS[param(params, "tab") ?? ""];

  if (!type) {
    const sacks = await listHopperSacks(period, EXPORT_LIMIT);
    return {
      filename: ["produccion_entrada", suffix].filter(Boolean).join("_"),
      sheets: [
        {
          name: "Entrada a tolva",
          columns: [
            { header: "QR", key: "qr", width: 18 },
            { header: "Material", key: "material", width: 24 },
            { header: "Peso (kg)", key: "weight", numFmt: NUM.kg },
            { header: "Zona", key: "zone", width: 14 },
            { header: "Entrada a tolva", key: "enteredAt", width: 18 },
          ],
          rows: sacks.map((s) => ({
            qr: s.qrCode,
            material: s.material.name,
            weight: s.weight,
            zone: s.zone?.name,
            enteredAt: xDateTime(s.enteredHopperAt),
          })),
        },
      ],
    };
  }

  const sacks = await listOutputSacksByType(type, period, EXPORT_LIMIT);
  const label = LOT_TYPE_LABELS[type];
  return {
    filename: [`produccion_${param(params, "tab")}`, suffix]
      .filter(Boolean)
      .join("_"),
    sheets: [
      {
        name: label,
        columns: [
          { header: "QR", key: "qr", width: 18 },
          { header: "Material", key: "material", width: 24 },
          { header: "Peso (kg)", key: "weight", numFmt: NUM.kg },
          { header: "Sacas de origen", key: "origin", width: 40 },
          { header: "Lote", key: "lot", width: 14 },
          { header: "Fecha", key: "createdAt", width: 18 },
        ],
        rows: sacks.map((s) => ({
          qr: s.qrCode,
          material: s.material.name,
          weight: s.weight,
          origin: s.composedOf.map((c) => c.inputSack.qrCode).join(", "),
          lot: s.lot?.lotNumber,
          createdAt: xDateTime(s.createdAt),
        })),
      },
    ],
  };
};

// ─── Recepciones ─────────────────────────────────────────────────────────────

const recepciones: Builder = async (params) => {
  if (param(params, "tab") === "pesados") {
    const containers = await listReceivedContainers(EXPORT_LIMIT);
    return {
      filename: "recepciones_pesados",
      sheets: [
        {
          name: "Pesados",
          columns: [
            { header: "Contenedor", key: "reference", width: 20 },
            { header: "Proveedor", key: "supplier", width: 24 },
            { header: "Pesado", key: "weighedAt", width: 18 },
            { header: "Bruto (kg)", key: "gross", numFmt: NUM.kg },
            { header: "Tara (kg)", key: "tare", numFmt: NUM.kg },
            { header: "Neto (kg)", key: "net", numFmt: NUM.kg },
            { header: "Sacas", key: "sacks", numFmt: NUM.int },
            { header: "Origen peso", key: "source", width: 14 },
          ],
          rows: containers.map((c) => ({
            reference: c.reference,
            supplier: c.supplier.name,
            weighedAt: xDateTime(c.weighedAt),
            gross: c.grossWeight,
            tare: c.tareWeight,
            net: c.actualWeight,
            sacks: c.sacks.length,
            source: c.weightSource === "gestruck" ? "Gestruck" : "Manual",
          })),
        },
      ],
    };
  }

  const containers = await listPendingContainers({
    q: param(params, "q"),
    fecha: param(params, "fecha"),
  });
  return {
    filename: "recepciones_pendientes",
    sheets: [
      {
        name: "Pendientes de recibir",
        columns: [
          { header: "Contenedor", key: "reference", width: 20 },
          { header: "Proveedor", key: "supplier", width: 24 },
          { header: "Llegada prevista", key: "eta", width: 16 },
          { header: "Estimado (kg)", key: "expected", numFmt: NUM.kg },
          { header: "Tipo saca", key: "sackType", width: 16 },
          { header: "Nº sacas", key: "numSacks", numFmt: NUM.int },
        ],
        rows: containers.map((c) => ({
          reference: c.reference,
          supplier: c.supplier.name,
          eta: xDate(c.estimatedArrival),
          expected: c.expectedWeight,
          sackType: sackTypeLabel(c.sackType),
          numSacks: c.numSacks,
        })),
      },
    ],
  };
};

// ─── Consumibles ─────────────────────────────────────────────────────────────

const consumibles: Builder = async () => {
  const [consumables, balances, movements, lastPurchases] = await Promise.all([
    listConsumables(),
    listBuyerPalletBalances(),
    listPalletMovements(undefined, EXPORT_LIMIT),
    getLastPurchaseByConsumable(),
  ]);
  return {
    filename: "consumibles",
    sheets: [
      {
        name: "Stock",
        columns: [
          { header: "Consumible", key: "name", width: 24 },
          { header: "Tipo", key: "type", width: 16 },
          { header: "Stock actual", key: "stock", numFmt: NUM.int },
          { header: "Stock mínimo", key: "min", numFmt: NUM.int },
          { header: "Unidad", key: "unit", width: 10 },
          { header: "Coste unitario", key: "unitCost", numFmt: NUM.eur },
          { header: "Estado", key: "state", width: 14 },
          { header: "Última compra", key: "lastDate", width: 14 },
          { header: "Uds. última compra", key: "lastQty", numFmt: NUM.int },
        ],
        rows: consumables.map((c) => {
          const last = lastPurchases.get(c.id);
          const low = c.currentStock < c.minStock;
          const warn =
            !low && c.minStock > 0 && c.currentStock < c.minStock * 1.5;
          return {
            name: c.name,
            type: CONSUMABLE_TYPE_LABELS[c.type],
            stock: c.currentStock,
            min: c.minStock,
            unit: c.unit,
            unitCost: c.unitCost,
            state: low ? "Bajo mínimo" : warn ? "Ajustado" : "OK",
            lastDate: xDate(last?.date),
            lastQty: last?.quantity,
          };
        }),
      },
      {
        name: "Palés por comprador",
        columns: [
          { header: "Comprador", key: "buyer", width: 28 },
          { header: "Código", key: "code", width: 12 },
          { header: "Pendiente de devolver", key: "balance", numFmt: NUM.int },
        ],
        rows: balances.map((b) => ({
          buyer: b.buyerName,
          code: b.buyerCode,
          balance: b.balance,
        })),
      },
      {
        name: "Movimientos de palés",
        columns: [
          { header: "Fecha", key: "date", width: 18 },
          { header: "Cliente", key: "buyer", width: 28 },
          { header: "Tipo", key: "type", width: 16 },
          { header: "Cantidad", key: "qty", numFmt: NUM.int },
          { header: "Matrícula", key: "plate", width: 12 },
          { header: "Notas", key: "notes", width: 40 },
        ],
        rows: movements.map((m) => ({
          date: xDateTime(m.createdAt),
          buyer: m.buyer.name,
          type:
            m.quantity > 0
              ? "Préstamo"
              : m.condition === "NOK"
                ? "Devolución rota"
                : "Devolución OK",
          qty: m.quantity,
          plate: m.vehiclePlate,
          notes: m.notes,
        })),
      },
    ],
  };
};

// ─── Aprovisionamiento ───────────────────────────────────────────────────────

const aprovisionamiento: Builder = async (params) => {
  const status = param(params, "status");
  const filter = (Object.values(PurchaseOrderStatus) as string[]).includes(
    status ?? "",
  )
    ? (status as PurchaseOrderStatus)
    : undefined;
  const pivot = await listPurchaseOrdersPivot(filter);
  return {
    filename: filter
      ? `aprovisionamiento_${filter.toLowerCase()}`
      : "aprovisionamiento",
    sheets: [
      {
        name: "Órdenes de compra",
        columns: [
          { header: "Nº pedido", key: "po", width: 16 },
          { header: "Proveedor", key: "supplier", width: 24 },
          { header: "Material", key: "material", width: 24 },
          { header: "Estado", key: "status", width: 16 },
          { header: "Origen", key: "origin", width: 16 },
          { header: "Pedido (t)", key: "ordered", numFmt: NUM.tons },
          { header: "Enviado (t)", key: "sent", numFmt: NUM.tons },
          { header: "Recibido (t)", key: "received", numFmt: NUM.tons },
          { header: "Pendiente (t)", key: "pending", numFmt: NUM.tons },
          { header: "€/t", key: "ppt", numFmt: NUM.eur },
          { header: "Precio total", key: "total", numFmt: NUM.eur },
          { header: "Envíos", key: "shipments", numFmt: NUM.int },
          { header: "Próxima ETA planta", key: "nextEta", width: 16 },
          { header: "Creado", key: "createdAt", width: 14 },
        ],
        rows: pivot.map((p) => ({
          po: p.order.poNumber,
          supplier: p.order.supplier.name,
          material: p.materialName,
          status: PO_LABELS[p.order.status],
          origin: p.order.originPort,
          ordered: p.orderedTons,
          sent: p.sentTons,
          received: p.receivedTons,
          pending: p.pendingTons,
          ppt: p.order.pricePerTon,
          total: p.order.totalPrice,
          shipments: p.shipmentCount,
          nextEta: xDate(p.nextEtaPlanta),
          createdAt: xDate(p.order.createdAt),
        })),
      },
      {
        name: "Envíos",
        columns: [
          { header: "Nº pedido", key: "po", width: 16 },
          { header: "BL", key: "bl", width: 18 },
          { header: "Situación", key: "stage", width: 22 },
          { header: "Barco", key: "vessel", width: 18 },
          { header: "Salida", key: "departure", width: 14 },
          { header: "ETA Valencia", key: "etaValencia", width: 14 },
          { header: "Llegada Valencia", key: "arrivedValencia", width: 16 },
          { header: "ETA planta", key: "etaPlanta", width: 14 },
          { header: "Llegada planta", key: "arrivedPlanta", width: 16 },
          { header: "Peso (kg)", key: "weight", numFmt: NUM.kg },
          { header: "Contenedores", key: "containers", width: 30 },
        ],
        rows: pivot.flatMap((p) =>
          p.order.providerShipments.map((s) => ({
            po: p.order.poNumber,
            bl: s.billOfLading,
            stage: STAGE_LABELS[shipmentStage(s)],
            vessel: s.vessel,
            departure: xDate(s.departureDate),
            etaValencia: xDate(s.etaValencia),
            arrivedValencia: xDate(s.arrivedValencia),
            etaPlanta: xDate(s.etaPlanta),
            arrivedPlanta: xDate(s.arrivedPlanta),
            weight: s.weightKg,
            containers: s.containers.map((c) => c.reference).join(", "),
          })),
        ),
      },
    ],
  };
};

// ─── Expediciones ────────────────────────────────────────────────────────────

function lotsSheet(lots: AvailableOutputLot[]): SheetSpec {
  return {
    name: "Lotes de salida",
    columns: [
      { header: "Lote", key: "lot", width: 14 },
      { header: "Tipo", key: "type", width: 18 },
      { header: "Material", key: "material", width: 24 },
      { header: "Producido", key: "producedAt", width: 14 },
      { header: "Estado", key: "state", width: 12 },
      { header: "Envío", key: "shipment", width: 16 },
      { header: "Sacas", key: "sacks", numFmt: NUM.int },
      { header: "Peso (kg)", key: "kg", numFmt: NUM.kg },
      { header: "Coste material", key: "costMaterial", numFmt: NUM.eur },
      { header: "Coste producción", key: "costProcessing", numFmt: NUM.eur },
      { header: "Coste consumibles", key: "costConsumable", numFmt: NUM.eur },
      { header: "Coste total", key: "costTotal", numFmt: NUM.eur },
    ],
    rows: lots.map((l) => ({
      lot: l.lotNumber,
      type: LOT_TYPE_LABELS[l.type],
      material: l.materialName,
      producedAt: xDate(l.producedAt),
      state: LOT_STATE_LABELS[l.state],
      shipment: l.shipmentRef,
      sacks: l.sackCount,
      kg: l.availableKg,
      costMaterial: l.costs.material,
      costProcessing: l.costs.processing,
      costConsumable: l.costs.consumable,
      costTotal: l.costs.total,
    })),
  };
}

const expediciones: Builder = async (params) => {
  if (param(params, "tab") === "envios") {
    const status = param(params, "status");
    const filter = (Object.values(ShipmentStatus) as string[]).includes(
      status ?? "",
    )
      ? (status as ShipmentStatus)
      : undefined;
    const shipments = await listShipments(filter);
    return {
      filename: filter
        ? `expediciones_envios_${filter.toLowerCase()}`
        : "expediciones_envios",
      sheets: [
        {
          name: "Envíos",
          columns: [
            { header: "Referencia", key: "reference", width: 16 },
            { header: "Estado", key: "status", width: 12 },
            { header: "Comprador", key: "buyer", width: 26 },
            { header: "Transportista", key: "carrier", width: 22 },
            { header: "Matrícula", key: "plate", width: 12 },
            { header: "Conductor", key: "driver", width: 18 },
            { header: "Nº pedido", key: "order", width: 14 },
            { header: "Lotes", key: "lots", width: 30 },
            { header: "Peso (kg)", key: "kg", numFmt: NUM.kg },
            { header: "Programado", key: "scheduled", width: 14 },
            { header: "Expedido", key: "expedited", width: 18 },
            { header: "Entregado", key: "delivered", width: 18 },
            { header: "Albarán Holded", key: "albaran", width: 26 },
            { header: "Creado", key: "createdAt", width: 18 },
          ],
          rows: shipments.map((s) => ({
            reference: s.reference,
            status: SHIPMENT_LABELS[s.status],
            buyer: s.buyer.name,
            carrier: s.carrier?.name,
            plate: s.vehiclePlate,
            driver: s.driverName,
            order: s.orderNumber,
            lots: s.lots.map((l) => l.lot.lotNumber).join(", "),
            kg: s.lots.reduce((sum, l) => sum + l.weightKg, 0),
            scheduled: xDate(s.scheduledAt),
            expedited: xDateTime(s.expeditedAt),
            delivered: xDateTime(s.deliveredAt),
            albaran: s.holdedAlbaranId,
            createdAt: xDateTime(s.createdAt),
          })),
        },
        {
          name: "Lotes por envío",
          columns: [
            { header: "Envío", key: "reference", width: 16 },
            { header: "Estado", key: "status", width: 12 },
            { header: "Comprador", key: "buyer", width: 26 },
            { header: "Lote", key: "lot", width: 14 },
            { header: "Tipo", key: "type", width: 18 },
            { header: "Material", key: "material", width: 24 },
            { header: "Peso (kg)", key: "kg", numFmt: NUM.kg },
          ],
          rows: shipments.flatMap((s) =>
            s.lots.map((l) => ({
              reference: s.reference,
              status: SHIPMENT_LABELS[s.status],
              buyer: s.buyer.name,
              lot: l.lot.lotNumber,
              type: LOT_TYPE_LABELS[l.lot.type],
              material: l.lot.material.name,
              kg: l.weightKg,
            })),
          ),
        },
      ],
    };
  }

  const [lots, loose] = await Promise.all([
    getAvailableOutputLots(),
    getLooseOutputSacks(),
  ]);
  const looseRows = (
    [
      [LotType.PRODUCTO_TERMINADO, loose.productoTerminado],
      [LotType.SUBPRODUCTO, loose.subproducto],
      [LotType.RECHAZO, loose.rechazo],
    ] as const
  ).flatMap(([type, sacks]) =>
    sacks.map((s) => ({
      qr: s.qrCode,
      type: LOT_TYPE_LABELS[type],
      material: s.materialName,
      kg: s.weight,
    })),
  );
  return {
    filename: "expediciones_lotes",
    sheets: [
      lotsSheet([
        ...lots.productoTerminado,
        ...lots.subproducto,
        ...lots.rechazo,
      ]),
      {
        name: "Sacas sueltas",
        columns: [
          { header: "QR", key: "qr", width: 18 },
          { header: "Tipo", key: "type", width: 18 },
          { header: "Material", key: "material", width: 24 },
          { header: "Peso (kg)", key: "kg", numFmt: NUM.kg },
        ],
        rows: looseRows,
      },
    ],
  };
};

/** Módulos exportables → constructor del Excel. */
export const EXPORTS: Partial<Record<Module, Builder>> = {
  almacen,
  produccion,
  recepciones,
  consumibles,
  aprovisionamiento,
  expediciones,
};
