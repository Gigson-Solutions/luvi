import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { SackStatus, LotType } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  registerContainer,
  weighContainer,
  confirmReception,
} from "@/lib/services/reception.service";
import {
  enterHopper,
  createOutputSack,
  listWarehouseSacks,
  findWarehouseSackByQr,
  listTodayOutput,
  getProductionStats,
} from "@/lib/services/production.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Crea `n` sacas EN_ALMACEN vía el servicio de recepción y devuelve sus ids.
 * Cada llamada usa una referencia única para no colisionar.
 */
async function seedWarehouseSacks(
  n: number,
  actualWeight = 1000 * n,
): Promise<string[]> {
  const c = await registerContainer({
    reference: `PROD-${Math.random().toString(36).slice(2, 8)}`,
    supplierId: base.supplierId,
    materialId: base.materialId,
  });
  await weighContainer({ containerId: c.id, actualWeight });
  await confirmReception({
    containerId: c.id,
    materialId: base.materialId,
    zoneId: base.zoneAId,
    numSacks: n,
  });
  const sacks = await prisma.sack.findMany({
    where: { containerId: c.id },
    orderBy: { batchNumber: "asc" },
  });
  return sacks.map((s) => s.id);
}

describe("Producción — entrada a tolva", () => {
  it("mueve una saca EN_ALMACEN a EN_PRODUCCION y crea Transformation + TransformationInput", async () => {
    const [sackId] = await seedWarehouseSacks(1, 995);

    const res = await enterHopper(sackId, base.operarioId);
    expect(res.qrCode).toMatch(/^SACK-/);

    const sack = await prisma.sack.findUniqueOrThrow({ where: { id: sackId } });
    expect(sack.status).toBe(SackStatus.EN_PRODUCCION);

    const inputs = await prisma.transformationInput.findMany({
      where: { sackId },
      include: { transformation: true },
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].transformation.operatorId).toBe(base.operarioId);
    expect(inputs[0].transformation.endedAt).toBeNull();

    // La transformación abierta cuelga de un lote PT del día
    const transformation = await prisma.transformation.findUniqueOrThrow({
      where: { id: inputs[0].transformationId },
      include: { lot: true },
    });
    expect(transformation.lot.type).toBe(LotType.PRODUCTO_TERMINADO);
  });

  it("reutiliza la transformación abierta del día para varias sacas", async () => {
    const [s1, s2, s3] = await seedWarehouseSacks(3);

    await enterHopper(s1, base.operarioId);
    await enterHopper(s2, base.operarioId);
    await enterHopper(s3);

    const transformations = await prisma.transformation.findMany();
    expect(transformations).toHaveLength(1);

    const inputs = await prisma.transformationInput.findMany({
      where: { transformationId: transformations[0].id },
    });
    expect(inputs.map((i) => i.sackId).sort()).toEqual([s1, s2, s3].sort());
  });

  it("funciona sin operador (operatorId opcional)", async () => {
    const [sackId] = await seedWarehouseSacks(1);
    await expect(enterHopper(sackId)).resolves.toMatchObject({
      qrCode: expect.stringMatching(/^SACK-/),
    });
    const t = await prisma.transformation.findFirstOrThrow();
    expect(t.operatorId).toBeNull();
  });

  it("rechaza una saca que no está EN_ALMACEN", async () => {
    const [sackId] = await seedWarehouseSacks(1);
    await enterHopper(sackId, base.operarioId); // ya EN_PRODUCCION
    await expect(enterHopper(sackId, base.operarioId)).rejects.toThrow();
  });

  it("rechaza un id de saca inexistente", async () => {
    await expect(enterHopper("no-existe")).rejects.toThrow();
  });
});

describe("Producción — sacas de salida y lotes", () => {
  it("crea una saca PRODUCTO_TERMINADO con lote autogenerado (DDMMYY-nº)", async () => {
    const { qrCode, lotNumber } = await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 850,
      zoneId: base.zoneCId,
    });

    expect(qrCode).toMatch(/^SACK-/);
    expect(lotNumber).toMatch(/^\d{6}-\d+$/);

    const sack = await prisma.sack.findFirstOrThrow({ where: { qrCode } });
    expect(sack.status).toBe(SackStatus.PRODUCTO_TERMINADO);
    expect(sack.weight).toBe(850);
    expect(sack.zoneId).toBe(base.zoneCId);
    expect(sack.lotId).not.toBeNull();

    const lot = await prisma.productionLot.findUniqueOrThrow({
      where: { id: sack.lotId! },
    });
    expect(lot.lotNumber).toBe(lotNumber);
    expect(lot.type).toBe(LotType.PRODUCTO_TERMINADO);
    expect(lot.materialId).toBe(base.materialId);
  });

  it("el nº de lote coincide con la fecha de hoy en formato DDMMYY", async () => {
    const { lotNumber } = await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 500,
    });
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    expect(lotNumber.startsWith(`${dd}${mm}${yy}-`)).toBe(true);
  });

  it("acumula dos PT del mismo material en el mismo lote del día", async () => {
    const a = await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 900,
    });
    const b = await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 800,
    });

    expect(a.lotNumber).toBe(b.lotNumber);

    const lots = await prisma.productionLot.findMany({
      where: { type: LotType.PRODUCTO_TERMINADO },
    });
    expect(lots).toHaveLength(1);

    const sacks = await prisma.sack.findMany({ where: { lotId: lots[0].id } });
    expect(sacks).toHaveLength(2);
  });

  it("SUBPRODUCTO y RECHAZO crean lotes de su propio tipo", async () => {
    const sub = await createOutputSack({
      type: LotType.SUBPRODUCTO,
      materialId: base.materialId,
      weight: 300,
    });
    const rej = await createOutputSack({
      type: LotType.RECHAZO,
      materialId: base.materialId,
      weight: 120,
    });

    expect(sub.lotNumber).not.toBe(rej.lotNumber);

    const subLot = await prisma.productionLot.findUniqueOrThrow({
      where: { lotNumber: sub.lotNumber },
    });
    const rejLot = await prisma.productionLot.findUniqueOrThrow({
      where: { lotNumber: rej.lotNumber },
    });
    expect(subLot.type).toBe(LotType.SUBPRODUCTO);
    expect(rejLot.type).toBe(LotType.RECHAZO);

    const subSack = await prisma.sack.findFirstOrThrow({
      where: { qrCode: sub.qrCode },
    });
    const rejSack = await prisma.sack.findFirstOrThrow({
      where: { qrCode: rej.qrCode },
    });
    expect(subSack.status).toBe(SackStatus.SUBPRODUCTO);
    expect(rejSack.status).toBe(SackStatus.RECHAZO);
  });

  it("el nº secuencial del lote crece con el total de lotes del día", async () => {
    const pt = await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 400,
    });
    const sub = await createOutputSack({
      type: LotType.SUBPRODUCTO,
      materialId: base.materialId,
      weight: 200,
    });
    const seq = (n: string): number => Number(n.split("-")[1]);
    expect(seq(pt.lotNumber)).toBe(1);
    expect(seq(sub.lotNumber)).toBe(2);
  });

  it("rechaza peso <= 0", async () => {
    await expect(
      createOutputSack({
        type: LotType.PRODUCTO_TERMINADO,
        materialId: base.materialId,
        weight: 0,
      }),
    ).rejects.toThrow();
    await expect(
      createOutputSack({
        type: LotType.PRODUCTO_TERMINADO,
        materialId: base.materialId,
        weight: -5,
      }),
    ).rejects.toThrow();
  });
});

describe("Producción — consultas e historial", () => {
  it("listWarehouseSacks devuelve solo sacas EN_ALMACEN", async () => {
    const [s1] = await seedWarehouseSacks(2);
    await enterHopper(s1); // pasa a EN_PRODUCCION

    const warehouse = await listWarehouseSacks();
    expect(warehouse).toHaveLength(1);
    expect(warehouse.every((s) => s.status === SackStatus.EN_ALMACEN)).toBe(
      true,
    );
    expect(warehouse[0].material).not.toBeNull();
  });

  it("findWarehouseSackByQr localiza una saca EN_ALMACEN por QR", async () => {
    const [sackId] = await seedWarehouseSacks(1);
    const stored = await prisma.sack.findUniqueOrThrow({
      where: { id: sackId },
    });

    const found = await findWarehouseSackByQr(stored.qrCode);
    expect(found?.id).toBe(sackId);

    // tras entrar a tolva ya no aparece
    await enterHopper(sackId);
    expect(await findWarehouseSackByQr(stored.qrCode)).toBeNull();
  });

  it("listTodayOutput devuelve las sacas de salida de hoy (más reciente primero)", async () => {
    await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 500,
    });
    await createOutputSack({
      type: LotType.SUBPRODUCTO,
      materialId: base.materialId,
      weight: 200,
    });

    const output = await listTodayOutput();
    expect(output).toHaveLength(2);
    const statuses = output.map((s) => s.status);
    expect(statuses).toContain(SackStatus.PRODUCTO_TERMINADO);
    expect(statuses).toContain(SackStatus.SUBPRODUCTO);
    expect(output.every((s) => s.lot !== null)).toBe(true);
  });

  it("getProductionStats refleja en producción, PT de hoy y kg procesados", async () => {
    const [s1, s2] = await seedWarehouseSacks(2, 2000); // 1000 kg cada una
    await enterHopper(s1);
    await enterHopper(s2);
    await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 850,
    });

    const stats = await getProductionStats();
    expect(stats.inProduction).toBe(2);
    expect(stats.ptToday).toBe(1);
    expect(stats.kgProcessed).toBeCloseTo(2000, 1);
  });
});
