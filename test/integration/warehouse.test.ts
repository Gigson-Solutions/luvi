import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { SackStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  getWarehouseOverview,
  listSacks,
  getSackDetail,
  moveSack,
  setSackSupplier,
  setSuppliersForFilteredSacks,
} from "@/lib/services/warehouse.service";
import { createStockEntry } from "@/lib/services/stock-adjustment.service";
import {
  getExpectedStock,
  getLocationStats,
} from "@/lib/services/inventory.service";
import { NO_SUPPLIER } from "@/lib/warehouse-filters";

let base: Baseline;
let qrSeq = 0;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
  qrSeq = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea N sacas EN_ALMACEN en una zona con peso fijo. Devuelve los ids. */
async function seedSacks(
  zoneId: string,
  count: number,
  opts: { status?: SackStatus; weight?: number; materialId?: string } = {},
): Promise<void> {
  const status = opts.status ?? SackStatus.EN_ALMACEN;
  const weight = opts.weight ?? 1000;
  const materialId = opts.materialId ?? base.materialId;
  await prisma.sack.createMany({
    data: Array.from({ length: count }, () => ({
      qrCode: `SACK-SEED-${qrSeq++}`,
      status,
      weight,
      materialId,
      zoneId,
    })),
  });
}

describe("Almacén — ocupación por zona (getWarehouseOverview)", () => {
  it("cuenta sólo sacas EN_ALMACEN y calcula % y peso por zona", async () => {
    await seedSacks(base.zoneAId, 50, { weight: 800 });
    // sacas en otros estados no ocupan hueco aunque conserven zoneId
    await seedSacks(base.zoneAId, 10, {
      status: SackStatus.EN_PRODUCCION,
      weight: 800,
    });

    const overview = await getWarehouseOverview();
    expect(overview.warehouses).toHaveLength(1);

    const wh = overview.warehouses[0];
    expect(wh.id).toBe(base.warehouseId);

    const zoneA = wh.zones.find((z) => z.id === base.zoneAId)!;
    expect(zoneA.sackCount).toBe(50);
    // 50 / 200 = 25%
    expect(zoneA.pct).toBe(25);
    expect(zoneA.weightKg).toBe(50 * 800);
    expect(zoneA.atLimit).toBe(false);

    // stats globales
    expect(overview.stats.totalSacks).toBe(50);
    expect(overview.stats.totalKg).toBe(50 * 800);
    expect(overview.stats.zonesAtLimit).toBe(0);
  });

  it("marca atLimit y capa el pct a 100 cuando la zona está llena o por encima", async () => {
    // zoneC cap = 150 → llenamos 150
    await seedSacks(base.zoneCId, 150, { weight: 500 });

    const overview = await getWarehouseOverview();
    const zoneC = overview.warehouses[0].zones.find(
      (z) => z.id === base.zoneCId,
    )!;
    expect(zoneC.sackCount).toBe(150);
    expect(zoneC.pct).toBe(100);
    expect(zoneC.atLimit).toBe(true);
    expect(overview.stats.zonesAtLimit).toBe(1);
  });

  it("reparte totales de almacén sumando todas las zonas", async () => {
    await seedSacks(base.zoneAId, 20);
    await seedSacks(base.zoneCId, 30);

    const overview = await getWarehouseOverview();
    const wh = overview.warehouses[0];
    expect(wh.totalSacks).toBe(50);
    expect(wh.totalCapacity).toBe(200 + 150);
    expect(overview.stats.totalSacks).toBe(50);
  });

  it("zona vacía => 0 sacas, 0%, no atLimit", async () => {
    const overview = await getWarehouseOverview();
    const zoneA = overview.warehouses[0].zones.find(
      (z) => z.id === base.zoneAId,
    )!;
    expect(zoneA.sackCount).toBe(0);
    expect(zoneA.pct).toBe(0);
    expect(zoneA.atLimit).toBe(false);
    expect(overview.stats.totalSacks).toBe(0);
  });
});

describe("Almacén — listado de sacas con filtros (listSacks)", () => {
  it("lista todas las sacas sin filtros con sus relaciones incluidas", async () => {
    await seedSacks(base.zoneAId, 3);
    const sacks = await listSacks();
    expect(sacks).toHaveLength(3);
    expect(sacks[0].material).not.toBeNull();
    expect(sacks[0].zone?.warehouse.id).toBe(base.warehouseId);
  });

  it("filtra por estado", async () => {
    await seedSacks(base.zoneAId, 4, { status: SackStatus.EN_ALMACEN });
    await seedSacks(base.zoneAId, 2, { status: SackStatus.EN_PRODUCCION });

    const enAlmacen = await listSacks({ status: SackStatus.EN_ALMACEN });
    expect(enAlmacen).toHaveLength(4);
    expect(enAlmacen.every((s) => s.status === SackStatus.EN_ALMACEN)).toBe(
      true,
    );
  });

  it("filtra por zona", async () => {
    await seedSacks(base.zoneAId, 3);
    await seedSacks(base.zoneCId, 5);

    const inC = await listSacks({ zoneId: base.zoneCId });
    expect(inC).toHaveLength(5);
    expect(inC.every((s) => s.zoneId === base.zoneCId)).toBe(true);
  });

  it("filtra por material", async () => {
    const otherMaterial = await prisma.material.create({
      data: { name: "Otro material", code: "OTRO-1", type: "PELLET_PE" },
    });
    await seedSacks(base.zoneAId, 2, { materialId: base.materialId });
    await seedSacks(base.zoneAId, 3, { materialId: otherMaterial.id });

    const byMaterial = await listSacks({ materialId: otherMaterial.id });
    expect(byMaterial).toHaveLength(3);
    expect(byMaterial.every((s) => s.materialId === otherMaterial.id)).toBe(
      true,
    );
  });

  it("admite varios valores por criterio (cualquiera de ellos)", async () => {
    await seedSacks(base.zoneAId, 2, { status: SackStatus.EN_ALMACEN });
    await seedSacks(base.zoneCId, 3, { status: SackStatus.EN_PRODUCCION });
    await seedSacks(base.zoneCId, 4, { status: SackStatus.ENTREGADA });

    const byStatus = await listSacks({
      status: [SackStatus.EN_ALMACEN, SackStatus.EN_PRODUCCION],
    });
    expect(byStatus).toHaveLength(5);

    const byZone = await listSacks({ zoneId: [base.zoneAId, base.zoneCId] });
    expect(byZone).toHaveLength(9);

    // Los criterios distintos se combinan entre sí (AND).
    const both = await listSacks({
      status: [SackStatus.EN_PRODUCCION, SackStatus.ENTREGADA],
      zoneId: [base.zoneCId],
    });
    expect(both).toHaveLength(7);

    // Una lista vacía equivale a no filtrar.
    expect(await listSacks({ status: [] })).toHaveLength(9);
  });

  it("filtra por proveedor, incluida la opción «sin proveedor»", async () => {
    const container = await prisma.container.create({
      data: { reference: "CONT-PROV-1", supplierId: base.supplierId },
    });
    // 3 sacas de un contenedor con proveedor y 4 sin contenedor (alta manual).
    await prisma.sack.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        qrCode: `SACK-PROV-${i}`,
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        containerId: container.id,
      })),
    });
    await seedSacks(base.zoneAId, 4);

    const withSupplier = await listSacks({ supplierId: base.supplierId });
    expect(withSupplier).toHaveLength(3);

    const noSupplier = await listSacks({ supplierId: NO_SUPPLIER });
    expect(noSupplier).toHaveLength(4);
    expect(noSupplier.every((s) => s.containerId === null)).toBe(true);

    // Ambos a la vez = todas; y se combina con el buscador libre.
    expect(
      await listSacks({ supplierId: [base.supplierId, NO_SUPPLIER] }),
    ).toHaveLength(7);
    expect(
      await listSacks({ supplierId: NO_SUPPLIER, search: "SACK-PROV" }),
    ).toHaveLength(0);
    expect(
      await listSacks({ supplierId: base.supplierId, search: "SACK-PROV" }),
    ).toHaveLength(3);
  });

  it("respeta el límite (take)", async () => {
    await seedSacks(base.zoneAId, 10);
    const limited = await listSacks({}, 4);
    expect(limited).toHaveLength(4);
  });
});

describe("Almacén — detalle de saca (getSackDetail)", () => {
  it("devuelve la saca con material, zona+almacén y contenedor+proveedor", async () => {
    const container = await prisma.container.create({
      data: { reference: "CONT-DET-1", supplierId: base.supplierId },
    });
    const sack = await prisma.sack.create({
      data: {
        qrCode: "SACK-DETAIL-1",
        status: SackStatus.EN_ALMACEN,
        weight: 999,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        containerId: container.id,
      },
    });

    const detail = await getSackDetail(sack.id);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(sack.id);
    expect(detail!.material.id).toBe(base.materialId);
    expect(detail!.zone?.warehouse.id).toBe(base.warehouseId);
    expect(detail!.container?.supplier.id).toBe(base.supplierId);
  });

  it("devuelve null si la saca no existe", async () => {
    const detail = await getSackDetail("noexiste-id");
    expect(detail).toBeNull();
  });
});

describe("Almacén — traslado de sacas entre zonas (moveSack)", () => {
  it("traslada una saca a otra zona cuando hay hueco", async () => {
    const sack = await prisma.sack.create({
      data: {
        qrCode: "SACK-MOVE-1",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
      },
    });

    const moved = await moveSack({ sackId: sack.id, zoneId: base.zoneCId });
    expect(moved.zoneId).toBe(base.zoneCId);
    expect(moved.zone?.id).toBe(base.zoneCId);

    const reloaded = await prisma.sack.findUniqueOrThrow({
      where: { id: sack.id },
    });
    expect(reloaded.zoneId).toBe(base.zoneCId);
  });

  it("rechaza el traslado si la saca ya está en esa zona", async () => {
    const sack = await prisma.sack.create({
      data: {
        qrCode: "SACK-MOVE-SAME",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
      },
    });
    await expect(
      moveSack({ sackId: sack.id, zoneId: base.zoneAId }),
    ).rejects.toThrow();
  });

  it("rechaza el traslado si la zona destino está a su capacidad máxima", async () => {
    // Llenamos zoneC (cap 150) con 150 sacas EN_ALMACEN
    await seedSacks(base.zoneCId, 150);
    // Saca a trasladar, en zoneA
    const sack = await prisma.sack.create({
      data: {
        qrCode: "SACK-MOVE-FULL",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
      },
    });

    await expect(
      moveSack({ sackId: sack.id, zoneId: base.zoneCId }),
    ).rejects.toThrow(/capacidad máxima/);

    // No se movió
    const reloaded = await prisma.sack.findUniqueOrThrow({
      where: { id: sack.id },
    });
    expect(reloaded.zoneId).toBe(base.zoneAId);
  });

  it("permite el traslado si las sacas que llenan la zona no están EN_ALMACEN", async () => {
    // 150 sacas en zoneC pero en producción → no cuentan para el aforo
    await seedSacks(base.zoneCId, 150, { status: SackStatus.EN_PRODUCCION });
    const sack = await prisma.sack.create({
      data: {
        qrCode: "SACK-MOVE-NONBLOCK",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
      },
    });

    const moved = await moveSack({ sackId: sack.id, zoneId: base.zoneCId });
    expect(moved.zoneId).toBe(base.zoneCId);
  });
});

describe("Almacén — proveedor propio de las sacas sin contenedor", () => {
  async function otherSupplier(): Promise<string> {
    const s = await prisma.supplier.create({
      data: { name: "Otro proveedor", code: "OTRO" },
    });
    return s.id;
  }

  it("el alta manual guarda el proveedor (opcional) en cada saca", async () => {
    const conProveedor = await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 3,
      weightPerSack: 900,
      date: new Date(),
      supplierId: base.supplierId,
    });
    const sinProveedor = await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 2,
      weightPerSack: 900,
      date: new Date(),
    });
    expect(conProveedor.numSacks).toBe(3);
    expect(sinProveedor.numSacks).toBe(2);

    expect(await listSacks({ supplierId: base.supplierId })).toHaveLength(3);
    expect(await listSacks({ supplierId: NO_SUPPLIER })).toHaveLength(2);
  });

  it("el filtro de proveedor cuenta el del contenedor o, si no hay, el propio", async () => {
    const container = await prisma.container.create({
      data: { reference: "CONT-PROP-1", supplierId: base.supplierId },
    });
    await prisma.sack.create({
      data: {
        qrCode: "SACK-PROP-C",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        containerId: container.id,
      },
    });
    await prisma.sack.create({
      data: {
        qrCode: "SACK-PROP-P",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        supplierId: base.supplierId,
      },
    });
    await seedSacks(base.zoneAId, 2);

    expect(await listSacks({ supplierId: base.supplierId })).toHaveLength(2);
    expect(await listSacks({ supplierId: NO_SUPPLIER })).toHaveLength(2);
    expect(
      await listSacks({ supplierId: [base.supplierId, NO_SUPPLIER] }),
    ).toHaveLength(4);
  });

  it("setSackSupplier asigna y quita, y rechaza las sacas con contenedor", async () => {
    await seedSacks(base.zoneAId, 1);
    const [sack] = await listSacks({ supplierId: NO_SUPPLIER });

    await setSackSupplier(sack.id, base.supplierId);
    expect((await getSackDetail(sack.id))?.supplier?.id).toBe(base.supplierId);
    expect(await listSacks({ supplierId: NO_SUPPLIER })).toHaveLength(0);

    await setSackSupplier(sack.id, null);
    expect((await getSackDetail(sack.id))?.supplier).toBeNull();

    const container = await prisma.container.create({
      data: { reference: "CONT-PROP-2", supplierId: base.supplierId },
    });
    const withContainer = await prisma.sack.create({
      data: {
        qrCode: "SACK-PROP-X",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        containerId: container.id,
      },
    });
    await expect(
      setSackSupplier(withContainer.id, await otherSupplier()),
    ).rejects.toThrow(/contenedor/);
  });

  it("asignar en bloque solo toca las sacas filtradas y sin contenedor", async () => {
    const container = await prisma.container.create({
      data: { reference: "CONT-PROP-3", supplierId: base.supplierId },
    });
    await prisma.sack.create({
      data: {
        qrCode: "SACK-PROP-K",
        status: SackStatus.EN_ALMACEN,
        weight: 1000,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        containerId: container.id,
      },
    });
    await seedSacks(base.zoneAId, 3);
    await seedSacks(base.zoneCId, 2);
    const nuevo = await otherSupplier();

    // Solo las 3 sin proveedor de la zona A (las de la zona C no entran).
    const count = await setSuppliersForFilteredSacks(
      { supplierId: NO_SUPPLIER, zoneId: base.zoneAId },
      nuevo,
    );
    expect(count).toBe(3);
    expect(await listSacks({ supplierId: nuevo })).toHaveLength(3);
    expect(await listSacks({ supplierId: NO_SUPPLIER })).toHaveLength(2);

    // La saca con contenedor conserva el de su contenedor.
    const kept = (await listSacks({ search: "SACK-PROP-K" }))[0];
    expect(kept.supplierId).toBeNull();
    expect(kept.containerId).toBe(container.id);
  });

  it("Inventario → Ubicación agrupa por el proveedor propio de la saca", async () => {
    const nuevo = await otherSupplier();
    await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 4,
      weightPerSack: 500,
      date: new Date(),
      supplierId: nuevo,
    });
    await seedSacks(base.zoneAId, 2);

    const stats = await getLocationStats();
    const otro = stats.find((p) => p.supplierId === nuevo);
    expect(otro?.provider).toBe("Otro proveedor");
    expect(otro?.totalCount).toBe(4);
    const sin = stats.find((p) => p.supplierId === null);
    expect(sin?.provider).toBe("Sin proveedor");
    expect(sin?.totalCount).toBe(2);

    // El filtro de proveedor de Inventario también lo reconoce.
    const filtrado = await getLocationStats({
      supplierIds: [nuevo],
      warehouseIds: [],
      materialIds: [],
      categoryIds: [],
    });
    expect(filtrado).toHaveLength(1);
    expect(filtrado[0].totalCount).toBe(4);
  });
});

describe("Inventario — filtro por Tipo de material", () => {
  it("filtra Ubicación y Stock esperado por la categoría de los materiales", async () => {
    const caliente = await prisma.materialCategory.create({
      data: { name: "MATERIA PRIMA CALIENTE" },
    });
    const fria = await prisma.materialCategory.create({
      data: { name: "MATERIA PRIMA FRÍA" },
    });
    const matCaliente = await prisma.material.create({
      data: {
        name: "MP caliente",
        code: "MP-C-T",
        type: "PELLET_PE",
        categoryId: caliente.id,
      },
    });
    const matFria = await prisma.material.create({
      data: {
        name: "MP fría",
        code: "MP-F-T",
        type: "PELLET_PE",
        categoryId: fria.id,
      },
    });
    await seedSacks(base.zoneAId, 3, { materialId: matCaliente.id });
    await seedSacks(base.zoneAId, 5, { materialId: matFria.id });
    await seedSacks(base.zoneAId, 2); // material de prueba, sin categoría

    const total = (await getLocationStats()).reduce(
      (acc, p) => acc + p.totalCount,
      0,
    );
    expect(total).toBe(10);

    const filters = {
      supplierIds: [],
      warehouseIds: [],
      materialIds: [],
    };
    const soloCaliente = await getLocationStats({
      ...filters,
      categoryIds: [caliente.id],
    });
    expect(soloCaliente.reduce((a, p) => a + p.totalCount, 0)).toBe(3);

    const ambas = await getLocationStats({
      ...filters,
      categoryIds: [caliente.id, fria.id],
    });
    expect(ambas.reduce((a, p) => a + p.totalCount, 0)).toBe(8);

    // Tipo + producto: la intersección (el producto frío no es caliente).
    const interseccion = await getLocationStats({
      ...filters,
      categoryIds: [caliente.id],
      materialIds: [matFria.id],
    });
    expect(interseccion).toHaveLength(0);

    const stock = await getExpectedStock({
      ...filters,
      categoryIds: [fria.id],
    });
    expect(stock.totals.currentCount).toBe(5);
  });
});
