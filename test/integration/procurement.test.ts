import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PurchaseOrderStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  setPurchaseOrderStatus,
  createProviderShipment,
  updateProviderShipment,
  setShipmentStage,
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
// GL-50: las ETAs las teclea el usuario; aquí fijamos unas de referencia.
const ETA_VALENCIA = new Date(DEPARTURE.getTime() + 30 * MS_PER_DAY);
const ETA_PLANTA = new Date(DEPARTURE.getTime() + 37 * MS_PER_DAY);

// Referencias de contenedor únicas a nivel global (Container.reference es @unique),
// para que crear varios envíos en un mismo test no colisione.
let seq = 0;
function containers(n = 1, totalWeightKg?: number): ShipmentContainerInput[] {
  return Array.from({ length: n }, () => {
    seq += 1;
    return {
      billOfLading: `BL-${seq}`,
      reference: `CONT-${seq}`,
      // GL-57: el peso del envío es la suma del de sus contenedores.
      ...(totalWeightKg != null ? { weight: totalWeightKg / n } : {}),
    };
  });
}

/**
 * Helper: envío con fecha de salida y ETAs fijas. El peso pedido se reparte
 * entre los contenedores, que es de donde sale el peso del envío (GL-57).
 */
function ship(
  purchaseOrderId: string,
  weightKg: number,
  conts?: ShipmentContainerInput[],
) {
  return createProviderShipment({
    purchaseOrderId,
    departureDate: DEPARTURE,
    etaValencia: ETA_VALENCIA,
    etaPlanta: ETA_PLANTA,
    containers:
      conts?.map((c, i, all) => ({ ...c, weight: weightKg / all.length })) ??
      containers(1, weightKg),
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
  it("GL-50/GL-57: guarda las ETAs tecleadas, suma el peso de los contenedores y pasa la PO a EN_TRANSITO", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 24,
    });

    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      departureDate: DEPARTURE,
      etaValencia: ETA_VALENCIA,
      etaPlanta: ETA_PLANTA,
      containers: [
        { billOfLading: "BL-0001", reference: "CONT-A", weight: 14000 },
        { billOfLading: "BL-0002", reference: "CONT-B", weight: 10000 },
      ],
    });

    expect(shipment.purchaseOrderId).toBe(po.id);
    // billOfLading del envío = BL del primer contenedor
    expect(shipment.billOfLading).toBe("BL-0001");
    expect(shipment.departureDate).toEqual(DEPARTURE);
    // GL-50: las ETAs son las que introdujo el usuario, no derivadas de días.
    expect(shipment.etaValencia).toEqual(ETA_VALENCIA);
    expect(shipment.etaPlanta).toEqual(ETA_PLANTA);
    // GL-57: peso del envío = suma de los pesos de sus contenedores.
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

  it("GL-57: sin pesos en los contenedores, el envío queda sin peso", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 10,
    });
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      departureDate: DEPARTURE,
      etaValencia: ETA_VALENCIA,
      etaPlanta: ETA_PLANTA,
      containers: [{ billOfLading: "BL-X", reference: "CONT-X" }],
    });
    expect(shipment.weightKg).toBeNull();
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
      etaValencia: ETA_VALENCIA,
      etaPlanta: ETA_PLANTA,
      containers: [
        { billOfLading: "BL-1", reference: "MSKU-100", weight: 8000 },
        { billOfLading: "BL-2", reference: "MSKU-200", weight: 8000 },
        { billOfLading: "BL-3", reference: "MSKU-300", weight: 8000 },
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
    expect(shipment.etaPlanta).toEqual(ETA_PLANTA);
    expect(
      shipment.containers.every(
        (c) =>
          c.estimatedArrival?.getTime() === ETA_PLANTA.getTime() &&
          c.actualWeight === null &&
          c.expectedWeight === 8000,
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

// ─── Tareas del cliente (07-sep) ────────────────────────────────────────────────

describe("Aprovisionamiento — costes y edición del pedido", () => {
  it("guarda todos los costes del pedido y los deja editables después", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 100,
      pricePerTon: 420,
      oceanFreightPerContainer: 1800,
      arrivalCostsPerContainer: 150,
      arrivalCostsPerShipment: 300,
      deliveryTransportPerContainer: 250,
      additionalCostsPerShipment: 90,
      customsDuties: 2500,
    });

    expect(po.pricePerTon).toBe(420);
    expect(po.oceanFreightPerContainer).toBe(1800);
    expect(po.customsDuties).toBe(2500);

    const edited = await updatePurchaseOrder({
      id: po.id,
      supplierId: base.supplierId,
      orderedTons: 120,
      pricePerTon: 400,
      oceanFreightPerContainer: 1950,
      arrivalCostsPerContainer: 150,
      arrivalCostsPerShipment: 300,
      deliveryTransportPerContainer: 250,
      additionalCostsPerShipment: 90,
      customsDuties: 2600,
    });

    expect(edited.poNumber).toBe(po.poNumber); // el nº de pedido no cambia
    expect(edited.orderedTons).toBe(120);
    expect(edited.pricePerTon).toBe(400);
    expect(edited.oceanFreightPerContainer).toBe(1950);
    expect(edited.customsDuties).toBe(2600);
  });

  it("el precio de la mercancía tecleado manda sobre el derivado del total", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
      totalPrice: 15000, // derivaría 750 €/t
      pricePerTon: 700,
    });
    expect(po.pricePerTon).toBe(700);
  });

  it("permite fijar el estado a mano y volver al automático", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    await ship(po.id, 20000); // el automático lo pondría EN_TRANSITO

    const manual = await setPurchaseOrderStatus(
      po.id,
      PurchaseOrderStatus.COMPLETADA,
    );
    expect(manual.status).toBe(PurchaseOrderStatus.COMPLETADA);

    // un cambio posterior en los envíos NO pisa el estado fijado a mano
    await markArrivedValencia((await listShipments())[0].id);
    let refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.status).toBe(PurchaseOrderStatus.COMPLETADA);
    expect(refreshed.statusManual).toBe(true);

    // volver al automático lo recalcula desde los envíos
    const auto = await setPurchaseOrderStatus(
      po.id,
      PurchaseOrderStatus.ABIERTA,
      true,
    );
    expect(auto.status).toBe(PurchaseOrderStatus.EN_TRANSITO);
    refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.statusManual).toBe(false);
  });
});

describe("Aprovisionamiento — edición del envío y etapas reversibles", () => {
  it("edita fechas y contenedores, y arrastra peso y ETA a Recepciones", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 40,
    });
    const shipment = await ship(po.id, 20000);
    const [original] = shipment.containers;
    const nuevaEta = new Date(ETA_PLANTA.getTime() + 7 * MS_PER_DAY);

    const updated = await updateProviderShipment({
      id: shipment.id,
      departureDate: DEPARTURE,
      etaValencia: ETA_VALENCIA,
      etaPlanta: nuevaEta,
      notes: "Retraso en origen",
      containers: [
        {
          id: original.id,
          billOfLading: original.billOfLading ?? "BL-1",
          reference: original.reference,
          weight: 22000,
        },
        { billOfLading: "BL-NUEVO", reference: "CONT-NUEVO", weight: 8000 },
      ],
    });

    expect(updated.notes).toBe("Retraso en origen");
    expect(updated.etaPlanta).toEqual(nuevaEta);
    expect(updated.weightKg).toBe(30000); // 22000 + 8000
    expect(updated.containers).toHaveLength(2);
    // los contenedores heredan la nueva fecha prevista y su peso
    expect(
      updated.containers.every(
        (c) => c.estimatedArrival?.getTime() === nuevaEta.getTime(),
      ),
    ).toBe(true);
    const byRef = new Map(updated.containers.map((c) => [c.reference, c]));
    expect(byRef.get(original.reference)?.expectedWeight).toBe(22000);
    expect(byRef.get("CONT-NUEVO")?.supplierId).toBe(base.supplierId);
    expect(byRef.get("CONT-NUEVO")?.materialId).toBe(base.materialId);
  });

  it("quita del envío un contenedor que ya no viene", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 40,
    });
    const shipment = await ship(po.id, 20000, containers(2));
    const [keep] = shipment.containers;

    const updated = await updateProviderShipment({
      id: shipment.id,
      etaValencia: ETA_VALENCIA,
      etaPlanta: ETA_PLANTA,
      containers: [
        {
          id: keep.id,
          billOfLading: keep.billOfLading ?? "BL",
          reference: keep.reference,
          weight: 10000,
        },
      ],
    });

    expect(updated.containers).toHaveLength(1);
    expect(updated.weightKg).toBe(10000);
  });

  it("no deja quitar un contenedor ya pesado en recepción", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 40,
    });
    const shipment = await ship(po.id, 20000, containers(2));
    const [pesado, otro] = shipment.containers;
    await prisma.container.update({
      where: { id: pesado.id },
      data: { actualWeight: 9800 },
    });

    await expect(
      updateProviderShipment({
        id: shipment.id,
        etaValencia: ETA_VALENCIA,
        etaPlanta: ETA_PLANTA,
        containers: [
          {
            id: otro.id,
            billOfLading: otro.billOfLading ?? "BL",
            reference: otro.reference,
            weight: 10000,
          },
        ],
      }),
    ).rejects.toThrow(/ya se ha recibido/i);
  });

  it("la etapa del envío se puede retroceder: ninguna llegada es irreversible", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    const shipment = await ship(po.id, 20000);

    const enPlanta = await setShipmentStage(shipment.id, "PLANTA");
    expect(shipmentStage(enPlanta)).toBe("PLANTA");

    const enValencia = await setShipmentStage(shipment.id, "VALENCIA");
    expect(shipmentStage(enValencia)).toBe("VALENCIA");
    expect(enValencia.arrivedPlanta).toBeNull();

    const enMar = await setShipmentStage(shipment.id, "MARITIMO");
    expect(shipmentStage(enMar)).toBe("MARITIMO");
    expect(enMar.arrivedValencia).toBeNull();
    expect(enMar.arrivedPlanta).toBeNull();

    // y el estado de la PO se recalcula al retroceder
    const refreshed = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(refreshed.status).toBe(PurchaseOrderStatus.EN_TRANSITO);
  });
});

describe("Aprovisionamiento — listado de envíos", () => {
  it("listShipments incluye PO, proveedor y contenedores", async () => {
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
