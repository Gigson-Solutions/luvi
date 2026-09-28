import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { SackStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createStockEntry,
  createStockExit,
  getSackAvailability,
  listStockAdjustments,
} from "@/lib/services/stock-adjustment.service";
import { listStockEntrySacks, sackLabel } from "@/lib/services/qr.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Altas y bajas manuales de sacas", () => {
  it("un alta crea N sacas en almacén con peso, ubicación, notas y QR único", async () => {
    const res = await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 5,
      weightPerSack: 1000,
      date: new Date("2026-09-28T12:00:00"),
      notes: "Stock inicial · BL MEDU1234",
      userId: base.adminId,
    });

    expect(res.numSacks).toBe(5);
    expect(res.totalWeight).toBe(5000);
    const sacks = await prisma.sack.findMany({
      where: { stockEntryId: res.id },
    });
    expect(sacks).toHaveLength(5);
    expect(new Set(sacks.map((s) => s.qrCode)).size).toBe(5);
    for (const s of sacks) {
      expect(s.status).toBe(SackStatus.EN_ALMACEN);
      expect(s.weight).toBe(1000);
      expect(s.zoneId).toBe(base.zoneAId);
      expect(s.notes).toBe("Stock inicial · BL MEDU1234");
    }
  });

  it("las etiquetas del alta salen numeradas con la fecha de alta y las notas", async () => {
    const res = await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 3,
      weightPerSack: 850.5,
      date: new Date("2026-09-15T12:00:00"),
      notes: "Stock inicial",
    });

    const labels = (await listStockEntrySacks(res.id)).map(sackLabel);
    expect(labels.map((l) => l.loteOSaca)).toEqual(["1/3", "2/3", "3/3"]);
    expect(labels[0].fecha).toBe("15/9/2026");
    expect(labels[0].notas).toBe("Stock inicial");
    expect(labels[0].pesoNetoKg).toBe(850.5);
    expect(labels[0].codigoProducto).toBe("PE-T1");
  });

  it("una baja pasa a BAJA las sacas más antiguas y registra el peso", async () => {
    const first = await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 2,
      weightPerSack: 500,
      date: new Date("2026-09-01T12:00:00"),
    });
    await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneCId,
      numSacks: 3,
      weightPerSack: 700,
      date: new Date("2026-09-02T12:00:00"),
    });

    const exit = await createStockExit({
      materialId: base.materialId,
      numSacks: 2,
      date: new Date("2026-09-28T12:00:00"),
      notes: "Merma",
    });

    expect(exit.totalWeight).toBe(1000);
    const removed = await prisma.sack.findMany({
      where: { stockExitId: exit.id },
    });
    expect(removed).toHaveLength(2);
    expect(removed.every((s) => s.status === SackStatus.BAJA)).toBe(true);
    expect(removed.every((s) => s.stockEntryId === first.id)).toBe(true);

    const adjustments = await listStockAdjustments();
    expect(adjustments.map((a) => a.type).sort()).toEqual([
      "ALTA",
      "ALTA",
      "BAJA",
    ]);
  });

  it("la baja respeta la ubicación y falla si no hay sacas suficientes", async () => {
    await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 2,
      weightPerSack: 500,
      date: new Date(),
    });
    await createStockEntry({
      materialId: base.materialId,
      zoneId: base.zoneCId,
      numSacks: 1,
      weightPerSack: 500,
      date: new Date(),
    });

    await expect(
      createStockExit({
        materialId: base.materialId,
        zoneId: base.zoneCId,
        numSacks: 2,
        date: new Date(),
      }),
    ).rejects.toThrow(/Solo hay 1 sacas/);
    // Nada a medias: ni movimiento ni sacas tocadas.
    expect(
      await prisma.stockAdjustment.count({ where: { type: "BAJA" } }),
    ).toBe(0);

    const availability = await getSackAvailability();
    const total = availability.reduce((sum, a) => sum + a.count, 0);
    expect(total).toBe(3);
  });

  it("rechaza cantidades y pesos no válidos", async () => {
    await expect(
      createStockEntry({
        materialId: base.materialId,
        zoneId: base.zoneAId,
        numSacks: 0,
        weightPerSack: 500,
        date: new Date(),
      }),
    ).rejects.toThrow();
    await expect(
      createStockEntry({
        materialId: base.materialId,
        zoneId: base.zoneAId,
        numSacks: 1,
        weightPerSack: 0,
        date: new Date(),
      }),
    ).rejects.toThrow();
  });
});
