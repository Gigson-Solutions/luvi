import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { LotType } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createOutputSack,
  listOutputSacksByType,
  getOutputCounts,
} from "@/lib/services/production.service";
import { getAvailableOutputLots } from "@/lib/services/shipment.service";
import type { ProductionPeriod } from "@/lib/shifts";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea una saca de PT y le fija la fecha de alta (instante UTC). */
async function ptAt(iso: string): Promise<string> {
  const { id, qrCode } = await createOutputSack({
    type: LotType.PRODUCTO_TERMINADO,
    materialId: base.materialId,
    weight: 500,
  });
  await prisma.sack.update({
    where: { id },
    data: { createdAt: new Date(iso) },
  });
  return qrCode;
}

async function qrsIn(period: ProductionPeriod): Promise<string[]> {
  const sacks = await listOutputSacksByType(LotType.PRODUCTO_TERMINADO, period);
  return sacks.map((s) => s.qrCode).sort();
}

describe("Producción — filtro por día y turno (hora de Madrid)", () => {
  it("reparte las sacas por turno y el de noche cruza la medianoche", async () => {
    // Septiembre: Madrid = UTC+2.
    const manana30 = await ptAt("2026-09-30T05:30:00Z"); // 07:30 del 30
    const noche30a = await ptAt("2026-09-30T21:30:00Z"); // 23:30 del 30
    const noche30b = await ptAt("2026-10-01T02:00:00Z"); // 04:00 del 1
    const noche29 = await ptAt("2026-09-30T03:00:00Z"); // 05:00 del 30
    // Diciembre: Madrid = UTC+1.
    const tardeDic = await ptAt("2026-12-01T13:30:00Z"); // 14:30 del 1/12

    expect(await qrsIn({ day: "2026-09-30", shift: "noche" })).toEqual(
      [noche30a, noche30b].sort(),
    );
    expect(await qrsIn({ day: "2026-09-30", shift: "manana" })).toEqual([
      manana30,
    ]);
    expect(await qrsIn({ day: "2026-09-29", shift: "noche" })).toEqual([
      noche29,
    ]);
    // Solo día: el día natural en Madrid.
    expect(await qrsIn({ day: "2026-09-30", shift: null })).toEqual(
      [manana30, noche30a, noche29].sort(),
    );
    // Solo turno: cualquier día.
    expect(await qrsIn({ day: null, shift: "noche" })).toEqual(
      [noche30a, noche30b, noche29].sort(),
    );
    expect(await qrsIn({ day: "2026-12-01", shift: "tarde" })).toEqual([
      tardeDic,
    ]);
    // Sin filtro: todas.
    expect(await qrsIn({ day: null, shift: null })).toHaveLength(5);
  });

  it("los contadores de las pestañas respetan el periodo", async () => {
    await ptAt("2026-09-30T05:30:00Z");
    await ptAt("2026-09-30T21:30:00Z");
    await createOutputSack({
      type: LotType.RECHAZO,
      materialId: base.materialId,
      weight: 100,
    });

    const counts = await getOutputCounts({ day: "2026-09-30", shift: "noche" });
    expect(counts[LotType.PRODUCTO_TERMINADO]).toBe(1);
    expect(counts[LotType.RECHAZO]).toBe(0);

    const all = await getOutputCounts();
    expect(all[LotType.PRODUCTO_TERMINADO]).toBe(2);
    expect(all[LotType.RECHAZO]).toBe(1);
  });
});

describe("Expediciones — coste de producción por material", () => {
  it("imputa a cada saca del lote el coste de producción de su material", async () => {
    await prisma.material.update({
      where: { id: base.materialId },
      data: { processingCost: 12.5 },
    });
    await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 500,
    });
    await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 600,
    });

    const { productoTerminado } = await getAvailableOutputLots();
    expect(productoTerminado).toHaveLength(1);
    expect(productoTerminado[0].costs.processing).toBe(25);
  });
});
