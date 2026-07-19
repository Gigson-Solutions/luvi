import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { SackStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  registerContainer,
  weighContainer,
  confirmReception,
  listPendingContainers,
  listReceivedContainers,
} from "@/lib/services/reception.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Recepciones — flujo registro → pesaje → confirmación", () => {
  it("registra un contenedor pendiente", async () => {
    const c = await registerContainer({
      reference: "MSKU-1",
      supplierId: base.supplierId,
      materialId: base.materialId,
      expectedWeight: 24000,
      numSacks: 24,
    });
    expect(c.actualWeight).toBeNull();
    const pending = await listPendingContainers();
    expect(pending.map((p) => p.reference)).toContain("MSKU-1");
  });

  it("pesa y confirma generando N sacas con QR y peso repartido", async () => {
    const c = await registerContainer({
      reference: "MSKU-2",
      supplierId: base.supplierId,
      materialId: base.materialId,
    });
    await weighContainer({
      containerId: c.id,
      actualWeight: 23880,
      weightSource: "manual",
    });
    const { sacksCreated } = await confirmReception({
      containerId: c.id,
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 24,
    });

    expect(sacksCreated).toBe(24);
    const sacks = await prisma.sack.findMany({ where: { containerId: c.id } });
    expect(sacks).toHaveLength(24);
    expect(sacks.every((s) => s.status === SackStatus.EN_ALMACEN)).toBe(true);
    expect(sacks.every((s) => s.zoneId === base.zoneAId)).toBe(true);
    expect(sacks.every((s) => s.qrCode.startsWith("SACK-"))).toBe(true);
    // 23880 / 24 = 995
    expect(sacks[0].weight).toBeCloseTo(995, 1);
    // QRs únicos
    expect(new Set(sacks.map((s) => s.qrCode)).size).toBe(24);
    // aparece en recibidos
    const received = await listReceivedContainers();
    expect(received.map((r) => r.reference)).toContain("MSKU-2");
  });

  it("no permite confirmar sin pesaje previo", async () => {
    const c = await registerContainer({
      reference: "MSKU-3",
      supplierId: base.supplierId,
    });
    await expect(
      confirmReception({
        containerId: c.id,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        numSacks: 5,
      }),
    ).rejects.toThrow();
  });

  it("no duplica sacas si ya se confirmó", async () => {
    const c = await registerContainer({
      reference: "MSKU-4",
      supplierId: base.supplierId,
    });
    await weighContainer({ containerId: c.id, actualWeight: 10000 });
    await confirmReception({
      containerId: c.id,
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 10,
    });
    await expect(
      confirmReception({
        containerId: c.id,
        materialId: base.materialId,
        zoneId: base.zoneAId,
        numSacks: 10,
      }),
    ).rejects.toThrow();
  });
});
