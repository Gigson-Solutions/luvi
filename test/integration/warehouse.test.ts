import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { SackStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  getWarehouseOverview,
  listSacks,
  getSackDetail,
  moveSack,
} from "@/lib/services/warehouse.service";

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
