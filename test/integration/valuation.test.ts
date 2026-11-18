import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { MaterialKind, MaterialType, SackStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  getInventoryValuation,
  listPriceGaps,
  setSupplierMaterialPrice,
  shipmentCostPerTon,
} from "@/lib/services/valuation.service";

let base: Baseline;
let seq = 0;
const uid = (): string => `v${++seq}`;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const NO_FILTERS = {
  supplierIds: [],
  warehouseIds: [],
  materialIds: [],
  categoryIds: [],
};

/** Tipo + producto. Los tipos «caliente/fría» de Luvi tienen kind OTRO. */
async function makeMaterial(
  categoryName: string,
  kind: MaterialKind = MaterialKind.OTRO,
): Promise<{ categoryId: string; materialId: string }> {
  const category = await prisma.materialCategory.create({
    data: { name: categoryName, kind },
  });
  const material = await prisma.material.create({
    data: {
      name: `Prod ${categoryName} ${uid()}`,
      code: `M-${uid()}`,
      type: MaterialType.OTRO,
      categoryId: category.id,
    },
  });
  return { categoryId: category.id, materialId: material.id };
}

/** Embarque de un pedido con precio y gastos, con n contenedores. */
async function makeShipment(opts: {
  supplierId?: string;
  pricePerTon: number | null;
  weightKg: number;
  containers?: number;
  oceanFreightPerContainer?: number;
  arrivalCostsPerShipment?: number;
  customsDuties?: number;
}): Promise<{ shipmentId: string; supplierId: string }> {
  const supplierId = opts.supplierId ?? base.supplierId;
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: `PO-${uid()}`,
      supplierId,
      orderedTons: opts.weightKg / 1000,
      pricePerTon: opts.pricePerTon,
      oceanFreightPerContainer: opts.oceanFreightPerContainer ?? null,
      arrivalCostsPerShipment: opts.arrivalCostsPerShipment ?? null,
      customsDuties: opts.customsDuties ?? null,
    },
  });
  const shipment = await prisma.providerShipment.create({
    data: { purchaseOrderId: po.id, weightKg: opts.weightKg },
  });
  const n = opts.containers ?? 1;
  for (let i = 0; i < n; i++) {
    await prisma.container.create({
      data: {
        reference: `CONT-${uid()}`,
        supplierId,
        providerShipmentId: shipment.id,
      },
    });
  }
  return { shipmentId: shipment.id, supplierId };
}

/** Sacas de entrada en almacén dentro de un contenedor del embarque. */
async function sacksInShipment(
  shipmentId: string,
  materialId: string,
  count: number,
  weightKg = 1000,
): Promise<void> {
  const container = await prisma.container.findFirstOrThrow({
    where: { providerShipmentId: shipmentId },
  });
  for (let i = 0; i < count; i++) {
    await prisma.sack.create({
      data: {
        qrCode: `SACK-${uid()}`,
        weight: weightKg,
        materialId,
        containerId: container.id,
        zoneId: base.zoneAId,
      },
    });
  }
}

/** Sacas de alta manual (sin contenedor) con proveedor propio. */
async function manualSacks(
  supplierId: string | null,
  materialId: string,
  count: number,
  weightKg = 1000,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await prisma.sack.create({
      data: {
        qrCode: `SACK-${uid()}`,
        weight: weightKg,
        materialId,
        supplierId,
        zoneId: base.zoneAId,
      },
    });
  }
}

describe("shipmentCostPerTon", () => {
  const order = {
    pricePerTon: 100,
    oceanFreightPerContainer: null,
    arrivalCostsPerContainer: null,
    arrivalCostsPerShipment: null,
    deliveryTransportPerContainer: null,
    additionalCostsPerShipment: null,
    customsDuties: null,
  };

  it("sin gastos es el precio de la mercancía", () => {
    expect(shipmentCostPerTon(order, 20, 20, 1)).toBe(100);
  });

  it("suma gastos por contenedor, por embarque y la parte de aranceles", () => {
    const cost = shipmentCostPerTon(
      {
        ...order,
        oceanFreightPerContainer: 500, // × 2 contenedores = 1000
        arrivalCostsPerShipment: 200,
        customsDuties: 400, // el embarque es la mitad del pedido → 200
      },
      20,
      40,
      2,
    );
    // (1000 + 200 + 200) / 20 t = 70 → 170
    expect(cost).toBe(170);
  });

  it("devuelve null sin precio de mercancía o sin peso", () => {
    expect(shipmentCostPerTon({ ...order, pricePerTon: null }, 20, 20, 1)).toBe(
      null,
    );
    expect(shipmentCostPerTon(order, 0, 0, 1)).toBe(null);
  });
});

describe("Valoración del inventario", () => {
  it("valora una saca con el coste de su embarque (mercancía + gastos)", async () => {
    const { categoryId, materialId } = await makeMaterial("CALIENTE");
    const { shipmentId } = await makeShipment({
      pricePerTon: 100,
      weightKg: 20_000,
      containers: 2,
      oceanFreightPerContainer: 500, // 1000 € / 20 t = +50
      customsDuties: 200, // / 20 t = +10
    });
    await sacksInShipment(shipmentId, materialId, 4); // 4 t

    const v = await getInventoryValuation(NO_FILTERS);
    expect(v.categories).toHaveLength(1);
    const c = v.categories[0];
    expect(c.categoryId).toBe(categoryId);
    expect(c.sacks).toBe(4);
    expect(c.tons).toBe(4);
    expect(c.avgPerTon).toBe(160);
    expect(c.value).toBe(640);
    expect(c.unpricedSacks).toBe(0);
  });

  it("la media del tipo es ponderada por toneladas entre proveedores", async () => {
    const { materialId } = await makeMaterial("CALIENTE");
    const other = await prisma.supplier.create({
      data: { name: "Otro proveedor", code: "PROV-OTRO", country: "ES" },
    });
    // 10 t a 150 €/t (embarque) + 30 t a 90 €/t (precio del proveedor) → 105
    const { shipmentId } = await makeShipment({
      pricePerTon: 150,
      weightKg: 10_000,
    });
    await sacksInShipment(shipmentId, materialId, 10);
    await manualSacks(other.id, materialId, 30);
    await setSupplierMaterialPrice(other.id, materialId, 90);

    const c = (await getInventoryValuation(NO_FILTERS)).categories[0];
    expect(c.tons).toBe(40);
    expect(c.value).toBe(1500 + 2700);
    expect(c.avgPerTon).toBe(105);
    expect(c.suppliers.map((s) => s.supplier).sort()).toEqual(
      ["Otro proveedor", "Proveedor Test"].sort(),
    );
    const otro = c.suppliers.find((s) => s.supplier === "Otro proveedor");
    expect(otro?.avgPerTon).toBe(90);
  });

  it("las sacas sin precio cuentan en toneladas pero no entran en la media", async () => {
    const { materialId } = await makeMaterial("CALIENTE");
    const { shipmentId } = await makeShipment({
      pricePerTon: 200,
      weightKg: 5000,
    });
    await sacksInShipment(shipmentId, materialId, 5);
    await manualSacks(null, materialId, 5); // sin proveedor ni precio

    const c = (await getInventoryValuation(NO_FILTERS)).categories[0];
    expect(c.tons).toBe(10);
    expect(c.pricedTons).toBe(5);
    expect(c.unpricedSacks).toBe(5);
    expect(c.avgPerTon).toBe(200);
  });

  it("un pedido sin precio cae al precio del proveedor y, si no hay, queda sin precio", async () => {
    const { materialId } = await makeMaterial("FRIA");
    const { shipmentId, supplierId } = await makeShipment({
      pricePerTon: null,
      weightKg: 3000,
    });
    await sacksInShipment(shipmentId, materialId, 3);
    let c = (await getInventoryValuation(NO_FILTERS)).categories[0];
    expect(c.avgPerTon).toBe(null);
    expect(c.unpricedSacks).toBe(3);

    await setSupplierMaterialPrice(supplierId, materialId, 120);
    c = (await getInventoryValuation(NO_FILTERS)).categories[0];
    expect(c.avgPerTon).toBe(120);
    expect(c.unpricedSacks).toBe(0);
  });

  it("separa caliente y fría, y deja fuera salida, no almacenadas y otros tipos de salida", async () => {
    const hot = await makeMaterial("CALIENTE");
    const cold = await makeMaterial("FRIA");
    const pt = await makeMaterial(
      "Producto Terminado",
      MaterialKind.PRODUCTO_TERMINADO,
    );
    await setSupplierMaterialPrice(base.supplierId, hot.materialId, 100);
    await setSupplierMaterialPrice(base.supplierId, cold.materialId, 50);
    await setSupplierMaterialPrice(base.supplierId, pt.materialId, 999);
    await manualSacks(base.supplierId, hot.materialId, 2);
    await manualSacks(base.supplierId, cold.materialId, 4);
    await manualSacks(base.supplierId, pt.materialId, 3);
    // Una saca caliente ya consumida no cuenta.
    await prisma.sack.create({
      data: {
        qrCode: `SACK-${uid()}`,
        weight: 1000,
        materialId: hot.materialId,
        supplierId: base.supplierId,
        status: SackStatus.PROCESADA,
      },
    });

    const v = await getInventoryValuation(NO_FILTERS);
    const byName = Object.fromEntries(v.categories.map((c) => [c.category, c]));
    expect(Object.keys(byName).sort()).toEqual(["CALIENTE", "FRIA"]);
    expect(byName.CALIENTE.avgPerTon).toBe(100);
    expect(byName.CALIENTE.sacks).toBe(2);
    expect(byName.FRIA.avgPerTon).toBe(50);
    expect(v.totals.sacks).toBe(6);
    expect(v.totals.value).toBe(2 * 100 + 4 * 50);
  });

  it("el filtro por tipo limita la valoración", async () => {
    const hot = await makeMaterial("CALIENTE");
    const cold = await makeMaterial("FRIA");
    await manualSacks(base.supplierId, hot.materialId, 1);
    await manualSacks(base.supplierId, cold.materialId, 1);
    const v = await getInventoryValuation({
      ...NO_FILTERS,
      categoryIds: [cold.categoryId],
    });
    expect(v.categories.map((c) => c.category)).toEqual(["FRIA"]);
  });
});

describe("Precio del stock sin pedido", () => {
  it("lista las combinaciones proveedor-producto con stock de alta manual", async () => {
    const { materialId } = await makeMaterial("CALIENTE");
    await manualSacks(base.supplierId, materialId, 3);
    await manualSacks(null, materialId, 2); // sin proveedor: no se puede asignar precio
    // Un producto de salida no es materia prima: no necesita precio de respaldo.
    const pt = await makeMaterial(
      "Producto Terminado",
      MaterialKind.PRODUCTO_TERMINADO,
    );
    await manualSacks(base.supplierId, pt.materialId, 4);
    let gaps = await listPriceGaps();
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ sacks: 3, tons: 3, pricePerTon: null });

    await setSupplierMaterialPrice(base.supplierId, materialId, 80);
    gaps = await listPriceGaps();
    expect(gaps[0].pricePerTon).toBe(80);
  });

  it("actualiza, quita y rechaza precios negativos", async () => {
    const { materialId } = await makeMaterial("CALIENTE");
    await setSupplierMaterialPrice(base.supplierId, materialId, 80);
    await setSupplierMaterialPrice(base.supplierId, materialId, 95);
    expect(await prisma.supplierMaterialPrice.count()).toBe(1);
    expect(
      (await prisma.supplierMaterialPrice.findFirstOrThrow()).pricePerTon,
    ).toBe(95);

    await expect(
      setSupplierMaterialPrice(base.supplierId, materialId, -1),
    ).rejects.toThrow(/igual o mayor que 0/);

    await setSupplierMaterialPrice(base.supplierId, materialId, null);
    expect(await prisma.supplierMaterialPrice.count()).toBe(0);
  });
});
