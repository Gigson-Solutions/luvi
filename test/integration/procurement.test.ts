import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PurchaseOrderStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createPurchaseOrder,
  createProviderShipment,
  markArrivedValencia,
  markArrivedPlanta,
  listPurchaseOrdersPivot,
  listShipments,
  getProcurementStats,
  shipmentStage,
  type ShipmentContainerInput,
} from "@/lib/services/procurement.service";

let base: Baseline;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEPARTURE = new Date("2026-08-01T00:00:00Z");

// Referencias de contenedor únicas a nivel global (Container.reference es @unique),
// para que crear varios envíos en un mismo test no colisione.
let seq = 0;
function containers(n = 1): ShipmentContainerInput[] {
  return Array.from({ length: n }, () => {
    seq += 1;
    return { billOfLading: `BL-${seq}`, reference: `CONT-${seq}` };
  });
}

/** Helper: envío con fecha de salida fija y contenedor(es) por defecto. */
function ship(
  purchaseOrderId: string,
  weightKg: number,
  conts: ShipmentContainerInput[] = containers(1),
) {
  return createProviderShipment({
    purchaseOrderId,
    departureDate: DEPARTURE,
    weightKg,
    containers: conts,
  });
}

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Aprovisionamiento — órdenes de compra", () => {
  it("crea una PO con poNumber autogenerado y estado ABIERTA", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 20,
    });

    expect(po.poNumber).toMatch(/^PO-\d{8}-\d{3}$/);
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    expect(po.poNumber).toBe(`PO-${datePart}-001`);
    expect(po.status).toBe(PurchaseOrderStatus.ABIERTA);
    expect(po.orderedTons).toBe(20);
    expect(po.supplierId).toBe(base.supplierId);
    expect(po.materialId).toBe(base.materialId);
    expect(po.supplier.id).toBe(base.supplierId);
    expect(po.providerShipments).toHaveLength(0);
  });

  it("genera poNumbers secuenciales dentro del mismo día", async () => {
    const a = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 10,
    });
    const b = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 15,
    });
    const c = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 5,
    });

    expect(a.poNumber.endsWith("-001")).toBe(true);
    expect(b.poNumber.endsWith("-002")).toBe(true);
    expect(c.poNumber.endsWith("-003")).toBe(true);
    // materialId opcional
    expect(a.materialId).toBeNull();
  });

  it("GL-44: guarda origen/precio total y deriva pricePerTon = total / toneladas", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
      originPort: "Shanghái · China",
      totalPrice: 15000,
    });

    expect(po.originPort).toBe("Shanghái · China");
    expect(po.totalPrice).toBe(15000);
    expect(po.pricePerTon).toBe(750); // 15000 / 20
  });

  it("GL-44: sin precio total no calcula pricePerTon", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    expect(po.totalPrice).toBeNull();
    expect(po.pricePerTon).toBeNull();
  });
});

describe("Aprovisionamiento — envíos de proveedor", () => {
  it("crea un envío, deriva las ETAs de la salida y pasa la PO a EN_TRANSITO", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 24,
    });

    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      departureDate: DEPARTURE,
      containers: [{ billOfLading: "BL-0001", reference: "CONT-A" }],
      weightKg: 24000,
    });

    expect(shipment.purchaseOrderId).toBe(po.id);
    // billOfLading del envío = BL del primer contenedor
    expect(shipment.billOfLading).toBe("BL-0001");
    expect(shipment.departureDate).toEqual(DEPARTURE);
    expect(shipment.maritimeDays).toBe(30);
    expect(shipment.terrestrialDays).toBe(7);
    // etaValencia = salida + 30; etaPlanta = salida + 37
    expect(shipment.etaValencia).toEqual(
      new Date(DEPARTURE.getTime() + 30 * MS_PER_DAY),
    );
    expect(shipment.etaPlanta).toEqual(
      new Date(DEPARTURE.getTime() + 37 * MS_PER_DAY),
    );
    expect(shipment.weightKg).toBe(24000);
    expect(shipment.arrivedValencia).toBeNull();
    expect(shipment.arrivedPlanta).toBeNull();
    expect(shipment.purchaseOrder?.supplier.id).toBe(base.supplierId);

    // la PO se recalcula a EN_TRANSITO
    const refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.status).toBe(PurchaseOrderStatus.EN_TRANSITO);
  });

  it("GL-45: respeta días de tránsito personalizados en el cálculo de ETAs", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 10,
    });
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      departureDate: DEPARTURE,
      maritimeDays: 40,
      terrestrialDays: 5,
      containers: [{ billOfLading: "BL-X", reference: "CONT-X" }],
      weightKg: 10000,
    });
    expect(shipment.etaValencia).toEqual(
      new Date(DEPARTURE.getTime() + 40 * MS_PER_DAY),
    );
    expect(shipment.etaPlanta).toEqual(
      new Date(DEPARTURE.getTime() + 45 * MS_PER_DAY),
    );
  });

  it("GL-45: crea un Container por par {BL, contenedor} con datos heredados y ETA planta", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 24,
    });

    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      departureDate: DEPARTURE,
      weightKg: 24000,
      containers: [
        { billOfLading: "BL-1", reference: "MSKU-100" },
        { billOfLading: "BL-2", reference: "MSKU-200" },
        { billOfLading: "BL-3", reference: "MSKU-300" },
      ],
    });

    expect(shipment.containers).toHaveLength(3);
    const refs = shipment.containers.map((c) => c.reference).sort();
    expect(refs).toEqual(["MSKU-100", "MSKU-200", "MSKU-300"]);
    expect(
      shipment.containers.every((c) => c.supplierId === base.supplierId),
    ).toBe(true);
    expect(
      shipment.containers.every((c) => c.materialId === base.materialId),
    ).toBe(true);
    // cada contenedor guarda su propio BL
    const byRef = new Map(shipment.containers.map((c) => [c.reference, c]));
    expect(byRef.get("MSKU-100")?.billOfLading).toBe("BL-1");
    expect(byRef.get("MSKU-200")?.billOfLading).toBe("BL-2");
    expect(
      shipment.containers.every((c) => c.providerShipmentId === shipment.id),
    ).toBe(true);
    // estimatedArrival = etaPlanta → aparecen en Recepciones como pendientes
    expect(
      shipment.containers.every(
        (c) =>
          c.estimatedArrival?.getTime() === shipment.etaPlanta?.getTime() &&
          c.actualWeight === null,
      ),
    ).toBe(true);
  });
});

describe("Aprovisionamiento — hitos de tránsito", () => {
  it("marca llegada a Valencia (sin tocar arrivedPlanta)", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    const shipment = await ship(po.id, 20000);
    expect(shipmentStage(shipment)).toBe("MARITIMO");

    const arrived = await markArrivedValencia(shipment.id);
    expect(arrived.arrivedValencia).toBeInstanceOf(Date);
    expect(arrived.arrivedPlanta).toBeNull();
    expect(shipmentStage(arrived)).toBe("VALENCIA");

    // en Valencia todavía no cuenta como recibido → sigue EN_TRANSITO
    const refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.status).toBe(PurchaseOrderStatus.EN_TRANSITO);
  });

  it("marca llegada a planta y rellena Valencia si no había pasado por ese hito", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    const shipment = await ship(po.id, 20000);

    const arrived = await markArrivedPlanta(shipment.id);
    expect(arrived.arrivedPlanta).toBeInstanceOf(Date);
    // backfill del hito de Valencia
    expect(arrived.arrivedValencia).toBeInstanceOf(Date);
    expect(shipmentStage(arrived)).toBe("PLANTA");
  });

  it("no sobrescribe la fecha de Valencia previa al llegar a planta", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    const shipment = await ship(po.id, 20000);

    const val = await markArrivedValencia(shipment.id);
    const valenciaDate = val.arrivedValencia;
    const planta = await markArrivedPlanta(shipment.id);
    expect(planta.arrivedValencia).toEqual(valenciaDate);
  });
});

describe("Aprovisionamiento — recálculo de estado de la PO", () => {
  it("pasa a COMPLETADA cuando las toneladas recibidas cubren lo pedido", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    const shipment = await ship(po.id, 20000);

    await markArrivedPlanta(shipment.id);
    const refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.status).toBe(PurchaseOrderStatus.COMPLETADA);
  });

  it("pasa a RECIBIDA_PARCIAL cuando lo recibido no cubre lo pedido", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    // primer envío: 10 t, el resto sigue en tránsito
    const s1 = await ship(po.id, 10000);
    const s2 = await ship(po.id, 10000);

    await markArrivedPlanta(s1.id);
    let refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.status).toBe(PurchaseOrderStatus.RECIBIDA_PARCIAL);

    // al llegar el segundo envío completa el pedido
    await markArrivedPlanta(s2.id);
    refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.status).toBe(PurchaseOrderStatus.COMPLETADA);
  });
});

describe("Aprovisionamiento — pivot y stats", () => {
  it("pivot refleja toneladas pedidas/enviadas/recibidas y nº de envíos", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 30,
    });
    const s1 = await ship(po.id, 12000);
    await ship(po.id, 8000);
    await markArrivedPlanta(s1.id);

    const pivot = await listPurchaseOrdersPivot();
    expect(pivot).toHaveLength(1);
    const row = pivot[0];
    expect(row.order.id).toBe(po.id);
    expect(row.materialName).toBe("Pellet PE Test");
    expect(row.orderedTons).toBe(30);
    expect(row.sentTons).toBeCloseTo(20, 2); // 12000 + 8000 kg
    expect(row.receivedTons).toBeCloseTo(12, 2); // solo s1 llegó a planta
    expect(row.shipmentCount).toBe(2);
  });

  it("stats: toneladas en tránsito (no en planta) y pedidos abiertos", async () => {
    const po1 = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 15,
    });
    const po2 = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    const s1 = await ship(po1.id, 15000);
    await ship(po2.id, 5000);

    let stats = await getProcurementStats();
    // ambos envíos en tránsito → 20 t; ambas POs abiertas (EN_TRANSITO)
    expect(stats.tonsInTransit).toBeCloseTo(20, 2);
    expect(stats.openOrders).toBe(2);

    // s1 llega a planta y completa po1 → deja de estar en tránsito y en abiertos
    await markArrivedPlanta(s1.id);
    stats = await getProcurementStats();
    expect(stats.tonsInTransit).toBeCloseTo(5, 2);
    expect(stats.openOrders).toBe(1);
  });

  it("listShipments devuelve envíos con su PO, proveedor y contenedores", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 10,
    });
    await ship(po.id, 10000, containers(2));

    const shipments = await listShipments();
    expect(shipments).toHaveLength(1);
    expect(shipments[0].purchaseOrder?.supplier.name).toBe("Proveedor Test");
    expect(shipments[0].containers).toHaveLength(2);
  });
});
