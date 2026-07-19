import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { LotType, QualityResult, PurchaseOrderStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  registerContainer,
  weighContainer,
  confirmReception,
} from "@/lib/services/reception.service";
import {
  getWarehouseDashboard,
  getProductionDashboard,
  getLogisticsDashboard,
  getQualityDashboard,
  getProcurementDashboard,
  resolveRange,
} from "@/lib/services/dashboard.service";

// Rango por defecto (últimos 30 días) — cubre los datos sembrados con now().
const range = resolveRange();

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Recibe un contenedor con N sacas EN_ALMACEN en la zona indicada. */
async function receiveContainer(opts: {
  reference: string;
  actualWeight: number;
  numSacks: number;
  zoneId: string;
}): Promise<void> {
  const c = await registerContainer({
    reference: opts.reference,
    supplierId: base.supplierId,
    materialId: base.materialId,
  });
  await weighContainer({ containerId: c.id, actualWeight: opts.actualWeight });
  await confirmReception({
    containerId: c.id,
    materialId: base.materialId,
    zoneId: opts.zoneId,
    numSacks: opts.numSacks,
  });
}

describe("Dashboards — BD recién sembrada (solo baseline)", () => {
  it("getWarehouseDashboard devuelve ceros y zonas vacías sin fallar", async () => {
    const d = await getWarehouseDashboard();
    expect(d.totalSacks).toBe(0);
    expect(d.totalKg).toBe(0);
    expect(d.zonesAtLimit).toBe(0);
    expect(d.byStatus).toEqual([]);
    // Baseline crea 2 zonas (A y C), ambas vacías.
    expect(d.zones).toHaveLength(2);
    expect(d.zones.every((z) => z.used === 0)).toBe(true);
    expect(d.zones.map((z) => z.capacity).sort((a, b) => a - b)).toEqual([
      150, 200,
    ]);
  });

  it("getProductionDashboard devuelve ceros sin fallar", async () => {
    const d = await getProductionDashboard(range);
    expect(d.lots).toBe(0);
    expect(d.kgProduced).toBe(0);
    expect(d.sacksInProduction).toBe(0);
    expect(d.byType).toEqual([]);
  });

  it("getLogisticsDashboard devuelve ceros sin fallar", async () => {
    const d = await getLogisticsDashboard(range);
    expect(d.byStatus).toEqual([]);
    expect(d.kgExpedited).toBe(0);
    expect(d.shipments).toBe(0);
  });

  it("getQualityDashboard devuelve ceros sin fallar", async () => {
    const d = await getQualityDashboard(range);
    expect(d).toEqual({ total: 0, ok: 0, nok: 0, pending: 0, rejectRate: 0 });
  });

  it("getProcurementDashboard devuelve ceros sin fallar", async () => {
    const d = await getProcurementDashboard();
    expect(d).toEqual({
      openOrders: 0,
      tonsInTransit: 0,
      shipmentsInTransit: 0,
    });
  });

  it("ninguna función de dashboard lanza con datos vacíos", async () => {
    await expect(
      Promise.all([
        getWarehouseDashboard(),
        getProductionDashboard(range),
        getLogisticsDashboard(range),
        getQualityDashboard(range),
        getProcurementDashboard(),
      ]),
    ).resolves.toBeDefined();
  });
});

describe("Dashboards — Almacén tras recepción", () => {
  it("refleja totalSacks, totalKg y ocupación de zona tras recibir un contenedor", async () => {
    await receiveContainer({
      reference: "CNT-DASH-1",
      actualWeight: 24000,
      numSacks: 24,
      zoneId: base.zoneAId,
    });

    const d = await getWarehouseDashboard();
    expect(d.totalSacks).toBe(24);
    // 24000 / 24 = 1000 por saca → 24000 kg totales.
    expect(d.totalKg).toBeCloseTo(24000, 1);

    // La zona A debe reflejar 24 sacas usadas.
    const zoneA = d.zones.find((z) => z.name === "Zona A");
    expect(zoneA).toBeDefined();
    expect(zoneA?.used).toBe(24);
    expect(zoneA?.capacity).toBe(200);

    // byStatus refleja las 24 sacas EN_ALMACEN.
    const enAlmacen = d.byStatus.find((s) => s.status === "EN_ALMACEN");
    expect(enAlmacen?.count).toBe(24);

    // Zona no llena → zonesAtLimit sigue en 0.
    expect(d.zonesAtLimit).toBe(0);
  });

  it("suma sacas de varios contenedores en distintas zonas", async () => {
    await receiveContainer({
      reference: "CNT-DASH-2A",
      actualWeight: 10000,
      numSacks: 10,
      zoneId: base.zoneAId,
    });
    await receiveContainer({
      reference: "CNT-DASH-2C",
      actualWeight: 5000,
      numSacks: 5,
      zoneId: base.zoneCId,
    });

    const d = await getWarehouseDashboard();
    expect(d.totalSacks).toBe(15);
    expect(d.totalKg).toBeCloseTo(15000, 1);
    expect(d.zones.find((z) => z.name === "Zona A")?.used).toBe(10);
    expect(d.zones.find((z) => z.name === "Zona C")?.used).toBe(5);
  });
});

describe("Dashboards — Calidad", () => {
  it("calcula ok/nok/rejectRate a partir de QualityRecords", async () => {
    const lot = await prisma.productionLot.create({
      data: {
        lotNumber: "080726-1",
        type: LotType.PRODUCTO_TERMINADO,
        materialId: base.materialId,
      },
    });

    // 3 OK + 1 NOK → rejectRate = 1/4 = 25%.
    await prisma.qualityRecord.createMany({
      data: [
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.OK,
        },
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.OK,
        },
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.OK,
        },
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.NOK,
        },
      ],
    });

    const d = await getQualityDashboard(range);
    expect(d.ok).toBe(3);
    expect(d.nok).toBe(1);
    expect(d.pending).toBe(0);
    expect(d.total).toBe(4);
    expect(d.rejectRate).toBe(25);
  });

  it("los registros PENDIENTE no afectan al rejectRate", async () => {
    const lot = await prisma.productionLot.create({
      data: {
        lotNumber: "080726-2",
        type: LotType.PRODUCTO_TERMINADO,
        materialId: base.materialId,
      },
    });
    await prisma.qualityRecord.createMany({
      data: [
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.OK,
        },
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.NOK,
        },
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.PENDIENTE,
        },
        {
          lotId: lot.id,
          materialId: base.materialId,
          result: QualityResult.PENDIENTE,
        },
      ],
    });

    const d = await getQualityDashboard(range);
    expect(d.ok).toBe(1);
    expect(d.nok).toBe(1);
    expect(d.pending).toBe(2);
    expect(d.total).toBe(4);
    // rejectRate solo sobre ok+nok → 1/2 = 50%.
    expect(d.rejectRate).toBe(50);
  });
});

describe("Dashboards — Aprovisionamiento", () => {
  it("cuenta toneladas y envíos en tránsito (sin arrivedPlanta)", async () => {
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-DASH-1",
        supplierId: base.supplierId,
        materialId: base.materialId,
        status: PurchaseOrderStatus.EN_TRANSITO,
        orderedTons: 50,
      },
    });

    // Dos envíos en tránsito: 24.000 + 26.000 kg = 50 t.
    await prisma.providerShipment.createMany({
      data: [
        {
          purchaseOrderId: po.id,
          billOfLading: "BL-1",
          weightKg: 24000,
          arrivedPlanta: null,
        },
        {
          purchaseOrderId: po.id,
          billOfLading: "BL-2",
          weightKg: 26000,
          arrivedPlanta: null,
        },
        // Uno ya llegado → NO cuenta como en tránsito.
        {
          purchaseOrderId: po.id,
          billOfLading: "BL-3",
          weightKg: 10000,
          arrivedPlanta: new Date(),
        },
      ],
    });

    const d = await getProcurementDashboard();
    expect(d.openOrders).toBe(1); // PO EN_TRANSITO cuenta como abierta.
    expect(d.shipmentsInTransit).toBe(2);
    expect(d.tonsInTransit).toBe(50);
  });
});
