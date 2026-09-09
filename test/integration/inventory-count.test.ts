import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { SackStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  startInventoryCount,
  scanSack,
  finishInventoryCount,
  getCountDetail,
  listInventoryCounts,
  getMissingSacks,
  findOpenCount,
} from "@/lib/services/inventory-count.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea `n` sacas EN_ALMACEN en la zona indicada y devuelve sus QR. */
async function seedSacks(n: number, zoneId?: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const sack = await prisma.sack.create({
      data: {
        qrCode: `SACK-INV-${i}-${Math.random().toString(36).slice(2, 8)}`,
        status: SackStatus.EN_ALMACEN,
        weight: 950 + i,
        materialId: base.materialId,
        zoneId: zoneId ?? base.zoneAId,
      },
    });
    codes.push(sack.qrCode);
  }
  return codes;
}

describe("Inventario por escaneo — sesión", () => {
  it("abre una sesión y no deja abrir una segunda a la vez", async () => {
    const count = await startInventoryCount({ userId: base.adminId });
    expect((await findOpenCount())?.id).toBe(count.id);

    await expect(startInventoryCount({})).rejects.toThrow(/ya hay un inventario/i);
  });

  it("cuenta lo escaneado contra el stock teórico", async () => {
    const [a, b] = await seedSacks(4);
    const count = await startInventoryCount({ userId: base.adminId });

    expect(await scanSack(count.id, a)).toMatchObject({ status: "ok" });
    expect(await scanSack(count.id, b)).toMatchObject({ status: "ok" });

    const detail = await getCountDetail(count.id);
    expect(detail?.expectedCount).toBe(4);
    expect(detail?.scannedCount).toBe(2);
    expect(detail?.unknownCount).toBe(0);
    expect(detail?.scans).toHaveLength(2);
  });

  it("avisa de una saca escaneada dos veces y no la cuenta de nuevo", async () => {
    const [a] = await seedSacks(2);
    const count = await startInventoryCount({});

    await scanSack(count.id, a);
    expect(await scanSack(count.id, a)).toMatchObject({
      status: "duplicada",
      qrCode: a,
    });

    const detail = await getCountDetail(count.id);
    expect(detail?.scannedCount).toBe(1);
    expect(detail?.scans).toHaveLength(1);
  });

  it("marca como no esperada una saca que no está en el stock teórico", async () => {
    await seedSacks(1);
    const enTransito = await prisma.sack.create({
      data: {
        qrCode: "SACK-FUERA",
        status: SackStatus.EN_TRANSITO,
        weight: 900,
        materialId: base.materialId,
      },
    });
    const count = await startInventoryCount({});

    const desconocida = await scanSack(count.id, "SACK-NO-EXISTE");
    expect(desconocida.status).toBe("no_esperada");

    const fuera = await scanSack(count.id, enTransito.qrCode);
    expect(fuera.status).toBe("no_esperada");

    const detail = await getCountDetail(count.id);
    expect(detail?.unknownCount).toBe(2);
    expect(detail?.scannedCount).toBe(0);
  });

  it("una sesión de un almacén solo cuenta las sacas de ese almacén", async () => {
    const otroAlmacen = await prisma.warehouse.create({
      data: {
        name: "Otra Planta",
        code: "PLANTA-2",
        zones: { create: [{ name: "Zona Z", code: "Z", maxCapacity: 50 }] },
      },
      include: { zones: true },
    });
    await seedSacks(3); // almacén de la baseline
    const [fuera] = await seedSacks(1, otroAlmacen.zones[0].id);

    const count = await startInventoryCount({ warehouseId: base.warehouseId });
    const detail = await getCountDetail(count.id);
    expect(detail?.expectedCount).toBe(3);

    // una saca del otro almacén no cuenta como esperada
    expect(await scanSack(count.id, fuera)).toMatchObject({
      status: "no_esperada",
    });
  });

  it("no admite escaneos en una sesión ya finalizada", async () => {
    const [a, b] = await seedSacks(2);
    const count = await startInventoryCount({});
    await scanSack(count.id, a);
    await finishInventoryCount(count.id);

    await expect(scanSack(count.id, b)).rejects.toThrow(/ya está finalizado/i);
    await expect(finishInventoryCount(count.id)).rejects.toThrow(
      /ya está finalizado/i,
    );
  });
});

describe("Inventario por escaneo — cierre y resultado", () => {
  it("al finalizar dice cuántas faltan y exactamente cuáles", async () => {
    const codes = await seedSacks(4);
    const count = await startInventoryCount({ userId: base.adminId });
    await scanSack(count.id, codes[0]);
    await scanSack(count.id, codes[2]);

    const result = await finishInventoryCount(count.id);
    expect(result.expectedCount).toBe(4);
    expect(result.scannedCount).toBe(2);
    expect(result.missingCount).toBe(2);
    expect(result.unknownCount).toBe(0);
    expect(result.missing.map((m) => m.qrCode).sort()).toEqual(
      [codes[1], codes[3]].sort(),
    );
    // el detalle de la saca que falta viene resuelto para la pantalla
    expect(result.missing[0].materialName).toBe("Pellet PE Test");
    expect(result.missing[0].zoneName).toBe("Zona A");
  });

  it("si se escanea todo, el recuento cuadra", async () => {
    const codes = await seedSacks(3);
    const count = await startInventoryCount({});
    for (const code of codes) await scanSack(count.id, code);

    const result = await finishInventoryCount(count.id);
    expect(result.missingCount).toBe(0);
    expect(result.missing).toHaveLength(0);
  });

  it("guarda fecha y resultado, y deja consultar las faltantes después", async () => {
    const codes = await seedSacks(3);
    const count = await startInventoryCount({ userId: base.adminId });
    await scanSack(count.id, codes[0]);
    await finishInventoryCount(count.id);

    const [historico] = await listInventoryCounts();
    expect(historico.finishedAt).toBeInstanceOf(Date);
    expect(historico.expectedCount).toBe(3);
    expect(historico.scannedCount).toBe(1);
    expect(historico.missingCount).toBe(2);
    expect(historico.userName).toBe("Admin Test");

    const missing = await getMissingSacks(count.id);
    expect(missing.map((m) => m.qrCode).sort()).toEqual(
      [codes[1], codes[2]].sort(),
    );
  });

  it("cerrar una sesión libera el hueco para la siguiente", async () => {
    const count = await startInventoryCount({});
    await finishInventoryCount(count.id);
    expect(await findOpenCount()).toBeNull();
    await expect(startInventoryCount({})).resolves.toMatchObject({
      id: expect.any(String),
    });
  });
});
