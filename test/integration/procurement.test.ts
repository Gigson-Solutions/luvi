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
} from "@/lib/services/procurement.service";

let base: Baseline;

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
});

describe("Aprovisionamiento — envíos de proveedor", () => {
  it("crea un envío asociado a la PO y la pasa a EN_TRANSITO", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 24,
    });

    const eta1 = new Date("2026-08-01T00:00:00Z");
    const eta2 = new Date("2026-08-10T00:00:00Z");
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      billOfLading: "BL-0001",
      origin: "Shanghai",
      vessel: "MSC Test",
      etaValencia: eta1,
      etaPlanta: eta2,
      weightKg: 24000,
    });

    expect(shipment.purchaseOrderId).toBe(po.id);
    expect(shipment.billOfLading).toBe("BL-0001");
    expect(shipment.origin).toBe("Shanghai");
    expect(shipment.vessel).toBe("MSC Test");
    expect(shipment.etaValencia).toEqual(eta1);
    expect(shipment.etaPlanta).toEqual(eta2);
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

  it("genera N contenedores placeholder con referencia y datos heredados de la PO", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 24,
    });

    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      billOfLading: "BL-CONT",
      weightKg: 24000,
      numContainers: 3,
    });

    expect(shipment.containers).toHaveLength(3);
    const refs = shipment.containers.map((c) => c.reference).sort();
    expect(refs).toEqual([
      `${po.poNumber}-C01`,
      `${po.poNumber}-C02`,
      `${po.poNumber}-C03`,
    ]);
    expect(
      shipment.containers.every((c) => c.supplierId === base.supplierId),
    ).toBe(true);
    expect(
      shipment.containers.every((c) => c.materialId === base.materialId),
    ).toBe(true);
    expect(shipment.containers.every((c) => c.billOfLading === "BL-CONT")).toBe(
      true,
    );
    expect(
      shipment.containers.every((c) => c.providerShipmentId === shipment.id),
    ).toBe(true);
  });

  it("no genera contenedores cuando numContainers es 0 o se omite", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 10,
    });
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 5000,
    });
    expect(shipment.containers).toHaveLength(0);
  });
});

describe("Aprovisionamiento — hitos de tránsito", () => {
  it("marca llegada a Valencia (sin tocar arrivedPlanta)", async () => {
    const po = await createPurchaseOrder({
      supplierId: base.supplierId,
      orderedTons: 20,
    });
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 20000,
    });
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
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 20000,
    });

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
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 20000,
    });

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
    const shipment = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 20000,
    });

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
    const s1 = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 10000,
    });
    const s2 = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 10000,
    });

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
    const s1 = await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 12000,
    });
    await createProviderShipment({ purchaseOrderId: po.id, weightKg: 8000 });
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
    const s1 = await createProviderShipment({
      purchaseOrderId: po1.id,
      weightKg: 15000,
    });
    await createProviderShipment({ purchaseOrderId: po2.id, weightKg: 5000 });

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
    await createProviderShipment({
      purchaseOrderId: po.id,
      weightKg: 10000,
      numContainers: 2,
    });

    const shipments = await listShipments();
    expect(shipments).toHaveLength(1);
    expect(shipments[0].purchaseOrder?.supplier.name).toBe("Proveedor Test");
    expect(shipments[0].containers).toHaveLength(2);
  });
});
