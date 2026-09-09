import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { LotType, SackStatus, ShipmentStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createShipment,
  confirmShipment,
  expediteShipment,
  deliverShipment,
  listShipments,
  getShipmentStats,
  getShipmentFormData,
  getPackingList,
} from "@/lib/services/shipment.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Crea un lote de Producto Terminado con `numSacks` sacas PRODUCTO_TERMINADO
 * (cada una con `weightPerSack` kg) asociadas a él. Devuelve el lote y sus ids.
 */
async function createPtLot(
  materialId: string,
  numSacks = 3,
  weightPerSack = 100,
): Promise<{ lotId: string; lotNumber: string; sackIds: string[] }> {
  const lotNumber = `LOT-${randomUUID().slice(0, 8).toUpperCase()}`;
  const lot = await prisma.productionLot.create({
    data: { lotNumber, type: LotType.PRODUCTO_TERMINADO, materialId },
  });
  const sackIds: string[] = [];
  for (let i = 0; i < numSacks; i++) {
    const sack = await prisma.sack.create({
      data: {
        qrCode: `SACK-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: SackStatus.PRODUCTO_TERMINADO,
        weight: weightPerSack,
        materialId,
        lotId: lot.id,
      },
    });
    sackIds.push(sack.id);
  }
  return { lotId: lot.id, lotNumber, sackIds };
}

describe("Expediciones — creación de envíos (BORRADOR)", () => {
  it("crea un envío en BORRADOR con comprador + lotes PT y referencia autogenerada", async () => {
    const pt = await createPtLot(base.materialId);

    const shipment = await createShipment({
      buyerId: base.buyerId,
      carrierId: base.carrierId,
      lots: [{ lotId: pt.lotId, weightKg: 300 }],
    });

    expect(shipment.status).toBe(ShipmentStatus.BORRADOR);
    expect(shipment.buyerId).toBe(base.buyerId);
    expect(shipment.carrierId).toBe(base.carrierId);
    expect(shipment.reference).toMatch(/^EXP-\d{6}-\d{3}$/);
    expect(shipment.lots).toHaveLength(1);
    expect(shipment.lots[0].lotId).toBe(pt.lotId);
    expect(shipment.lots[0].weightKg).toBe(300);
    // include: material vía lot
    expect(shipment.lots[0].lot.material.id).toBe(base.materialId);
    expect(shipment.holdedAlbaranId).toBeNull();
    expect(shipment.expeditedAt).toBeNull();
    expect(shipment.deliveredAt).toBeNull();
  });

  it("crea envío sin transportista (carrierId opcional)", async () => {
    const pt = await createPtLot(base.materialId);
    const shipment = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 50 }],
    });
    expect(shipment.carrierId).toBeNull();
    expect(shipment.status).toBe(ShipmentStatus.BORRADOR);
  });

  it("autogenera referencias secuenciales diarias (EXP-YYMMDD-001, -002)", async () => {
    const pt1 = await createPtLot(base.materialId);
    const pt2 = await createPtLot(base.materialId);
    const s1 = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt1.lotId, weightKg: 10 }],
    });
    const s2 = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt2.lotId, weightKg: 20 }],
    });
    const seq1 = Number(s1.reference.slice(-3));
    const seq2 = Number(s2.reference.slice(-3));
    expect(seq2).toBe(seq1 + 1);
    expect(s1.reference).not.toBe(s2.reference);
  });

  // GL-42: el envío se puede crear vacío y asignarle los lotes después; lo que
  // no se permite es expedirlo sin lotes.
  it("crea un envío vacío en BORRADOR y no deja expedirlo sin lotes", async () => {
    const vacio = await createShipment({ buyerId: base.buyerId, lots: [] });
    expect(vacio.status).toBe(ShipmentStatus.BORRADOR);
    expect(vacio.lots).toHaveLength(0);

    await expect(expediteShipment(vacio.id)).rejects.toThrow(
      /al menos un lote/i,
    );
  });

  it("rechaza envío con peso <= 0 en algún lote", async () => {
    const pt = await createPtLot(base.materialId);
    await expect(
      createShipment({
        buyerId: base.buyerId,
        lots: [{ lotId: pt.lotId, weightKg: 0 }],
      }),
    ).rejects.toThrow();
  });
});

describe("Expediciones — confirmación (BORRADOR → CONFIRMADO)", () => {
  it("confirma un envío en borrador", async () => {
    const pt = await createPtLot(base.materialId);
    const draft = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 100 }],
    });
    const confirmed = await confirmShipment(draft.id);
    expect(confirmed.status).toBe(ShipmentStatus.CONFIRMADO);
  });

  it("no permite confirmar un envío que no está en borrador", async () => {
    const pt = await createPtLot(base.materialId);
    const draft = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 100 }],
    });
    await confirmShipment(draft.id);
    await expect(confirmShipment(draft.id)).rejects.toThrow();
  });
});

describe("Expediciones — expedición (CONFIRMADO → EXPEDIDO)", () => {
  it("expide: guarda albarán SIM, marca sacas EN_TRANSITO y sella expeditedAt", async () => {
    const pt = await createPtLot(base.materialId, 3, 100);
    const draft = await createShipment({
      buyerId: base.buyerId,
      carrierId: base.carrierId,
      lots: [{ lotId: pt.lotId, weightKg: 300 }],
    });
    await confirmShipment(draft.id);

    const { shipment, simulated } = await expediteShipment(draft.id);

    // Modo simulado (sin HOLDED_API_KEY en test)
    expect(simulated).toBe(true);
    expect(shipment.status).toBe(ShipmentStatus.EXPEDIDO);
    expect(shipment.holdedAlbaranId).toBe(`SIM-${draft.reference}`);
    expect(shipment.expeditedAt).not.toBeNull();

    // Las sacas del lote pasan a EN_TRANSITO
    const sacks = await prisma.sack.findMany({ where: { lotId: pt.lotId } });
    expect(sacks).toHaveLength(3);
    expect(sacks.every((s) => s.status === SackStatus.EN_TRANSITO)).toBe(true);
  });

  it("no permite expedir dos veces el mismo envío", async () => {
    const pt = await createPtLot(base.materialId);
    const draft = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 100 }],
    });

    // Un envío en BORRADOR con lotes SÍ se puede expedir (no hace falta pasar
    // por CONFIRMADO); lo que no se puede es repetir la expedición.
    const { shipment } = await expediteShipment(draft.id);
    expect(shipment.status).toBe(ShipmentStatus.EXPEDIDO);
    await expect(expediteShipment(draft.id)).rejects.toThrow(/ya ha sido/i);

    // y las sacas quedaron en tránsito, no intactas
    const sacks = await prisma.sack.findMany({ where: { lotId: pt.lotId } });
    expect(sacks.every((s) => s.status === SackStatus.EN_TRANSITO)).toBe(true);
  });
});

describe("Expediciones — entrega (EXPEDIDO → ENTREGADO)", () => {
  it("entrega: sacas EN_TRANSITO → ENTREGADA y sella deliveredAt", async () => {
    const pt = await createPtLot(base.materialId, 2, 100);
    const draft = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 200 }],
    });
    await confirmShipment(draft.id);
    await expediteShipment(draft.id);

    const delivered = await deliverShipment(draft.id);
    expect(delivered.status).toBe(ShipmentStatus.ENTREGADO);
    expect(delivered.deliveredAt).not.toBeNull();

    const sacks = await prisma.sack.findMany({ where: { lotId: pt.lotId } });
    expect(sacks.every((s) => s.status === SackStatus.ENTREGADA)).toBe(true);
  });

  it("no permite entregar un envío que no está expedido", async () => {
    const pt = await createPtLot(base.materialId);
    const draft = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 100 }],
    });
    await confirmShipment(draft.id);
    await expect(deliverShipment(draft.id)).rejects.toThrow();
  });
});

describe("Expediciones — listados y StatCards", () => {
  it("lista envíos y filtra por estado", async () => {
    const pt1 = await createPtLot(base.materialId);
    const pt2 = await createPtLot(base.materialId);
    const draft1 = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt1.lotId, weightKg: 100 }],
    });
    const draft2 = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt2.lotId, weightKg: 100 }],
    });
    await confirmShipment(draft2.id);

    const all = await listShipments();
    expect(all).toHaveLength(2);

    const drafts = await listShipments(ShipmentStatus.BORRADOR);
    expect(drafts.map((s) => s.id)).toEqual([draft1.id]);

    const confirmed = await listShipments(ShipmentStatus.CONFIRMADO);
    expect(confirmed.map((s) => s.id)).toEqual([draft2.id]);
  });

  it("getShipmentStats cuenta por estado y suma kg expedidos", async () => {
    const pt1 = await createPtLot(base.materialId, 3, 100);
    const pt2 = await createPtLot(base.materialId);

    // Envío 1: expedido (aporta kgExpedited)
    const s1 = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt1.lotId, weightKg: 300 }],
    });
    await confirmShipment(s1.id);
    await expediteShipment(s1.id);

    // Envío 2: en borrador (no aporta kg)
    await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt2.lotId, weightKg: 999 }],
    });

    const stats = await getShipmentStats();
    expect(stats.byStatus.EXPEDIDO).toBe(1);
    expect(stats.byStatus.BORRADOR).toBe(1);
    expect(stats.byStatus.CONFIRMADO).toBe(0);
    expect(stats.byStatus.ENTREGADO).toBe(0);
    // solo el envío expedido cuenta para kg
    expect(stats.kgExpedited).toBe(300);
  });

  it("getShipmentFormData expone lotes PT con sacas disponibles", async () => {
    const pt = await createPtLot(base.materialId, 3, 100);

    const data = await getShipmentFormData();
    expect(data.buyers.map((b) => b.id)).toContain(base.buyerId);
    expect(data.carriers.map((c) => c.id)).toContain(base.carrierId);

    const lot = data.lots.find((l) => l.id === pt.lotId);
    expect(lot).toBeDefined();
    expect(lot?.availableSacks).toBe(3);
    expect(lot?.availableKg).toBe(300);
    expect(lot?.materialName).toBe("Pellet PE Test");
  });

  it("un lote sin sacas PRODUCTO_TERMINADO no aparece en getShipmentFormData", async () => {
    const pt = await createPtLot(base.materialId, 2, 100);
    const draft = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 200 }],
    });
    await confirmShipment(draft.id);
    await expediteShipment(draft.id); // sacas → EN_TRANSITO

    const data = await getShipmentFormData();
    expect(data.lots.find((l) => l.id === pt.lotId)).toBeUndefined();
  });
});

// ─── Tareas del cliente (07-sep) ────────────────────────────────────────────────

describe("Expediciones — packing list", () => {
  it("lista una fila por saca con su lote, BIG BAG y peso, más el total", async () => {
    const pt = await createPtLot(base.materialId, 3, 950);
    // numeramos las sacas dentro del lote como hace Producción
    const sacks = await prisma.sack.findMany({
      where: { lotId: pt.lotId },
      orderBy: { createdAt: "asc" },
    });
    let seq = 1;
    for (const s of sacks) {
      await prisma.sack.update({
        where: { id: s.id },
        data: { lotSequence: seq++ },
      });
    }

    const shipment = await createShipment({
      buyerId: base.buyerId,
      carrierId: base.carrierId,
      vehiclePlate: "1234-ABC",
      orderNumber: "PED-2026-0912",
      lots: [{ lotId: pt.lotId, weightKg: 2850 }],
    });

    const packing = await getPackingList(shipment.id);
    expect(packing).not.toBeNull();
    expect(packing?.orderNumber).toBe("PED-2026-0912");
    // sin albarán de Holded todavía, el nº de albarán es la referencia del envío
    expect(packing?.albaranNumber).toBe(shipment.reference);
    expect(packing?.buyerName).toBe("Comprador Test");
    expect(packing?.vehiclePlate).toBe("1234-ABC");
    expect(packing?.rows).toHaveLength(3);
    expect(packing?.rows.map((r) => r.sackNumber)).toEqual([
      `1/${pt.lotNumber}`,
      `2/${pt.lotNumber}`,
      `3/${pt.lotNumber}`,
    ]);
    expect(packing?.rows.every((r) => r.lotNumber === pt.lotNumber)).toBe(true);
    expect(packing?.totalWeightKg).toBe(2850);
  });

  it("tras expedir, usa el albarán de Holded y la fecha de expedición", async () => {
    const pt = await createPtLot(base.materialId, 1, 500);
    const shipment = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: pt.lotId, weightKg: 500 }],
    });
    const { shipment: expedido } = await expediteShipment(shipment.id);

    const packing = await getPackingList(shipment.id);
    expect(packing?.albaranNumber).toBe(expedido.holdedAlbaranId);
    expect(packing?.loadDate).toEqual(expedido.expeditedAt);
  });

  it("un envío sin lotes da un packing list vacío, no un error", async () => {
    const shipment = await createShipment({ buyerId: base.buyerId, lots: [] });
    const packing = await getPackingList(shipment.id);
    expect(packing?.rows).toHaveLength(0);
    expect(packing?.totalWeightKg).toBe(0);
  });

  it("devuelve null si el envío no existe", async () => {
    expect(await getPackingList("no-existe")).toBeNull();
  });
});
