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
  getAvailableOutputLots,
  createManualLot,
  removeSackFromLot,
  listStockMaterialsForLots,
  listStockSacksForLot,
} from "@/lib/services/shipment.service";
import {
  getOutputCounts,
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

  it("numera los BIG BAG seguidos en todo el envío, aunque haya varios lotes", async () => {
    const first = await createPtLot(base.materialId, 2, 1000);
    const second = await createPtLot(base.materialId, 3, 1000);
    const shipment = await createShipment({
      buyerId: base.buyerId,
      lots: [
        { lotId: second.lotId, weightKg: 3000 },
        { lotId: first.lotId, weightKg: 2000 },
      ],
    });

    const packing = await getPackingList(shipment.id);
    // lotes en orden de producción, sin reiniciar la numeración entre lotes
    expect(packing?.rows.map((r) => r.sackNumber)).toEqual([
      `1/${first.lotNumber}`,
      `2/${first.lotNumber}`,
      `3/${second.lotNumber}`,
      `4/${second.lotNumber}`,
      `5/${second.lotNumber}`,
    ]);
    expect(packing?.totalWeightKg).toBe(5000);
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

describe("Expediciones — lotes con sacas de almacén", () => {
  async function stockSacks(
    n: number,
    zoneId = base.zoneAId,
    materialId = base.materialId,
  ) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const s = await prisma.sack.create({
        data: {
          qrCode: `SACK-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: SackStatus.EN_ALMACEN,
          weight: 500,
          materialId,
          zoneId,
        },
      });
      ids.push(s.id);
    }
    return ids;
  }

  it("crea un lote con sacas EN_ALMACEN: pasan al estado del lote y quedan marcadas", async () => {
    const ids = await stockSacks(3);
    const lot = await createManualLot(LotType.SUBPRODUCTO, ids);
    expect(lot.sackCount).toBe(3);

    const sacks = await prisma.sack.findMany({ where: { id: { in: ids } } });
    expect(sacks.every((s) => s.status === SackStatus.SUBPRODUCTO)).toBe(true);
    expect(sacks.every((s) => s.fromStock)).toBe(true);
    expect(sacks.map((s) => s.lotSequence).sort()).toEqual([1, 2, 3]);

    // Y aparecen en Expediciones como lote disponible, con la marca.
    const lots = await getAvailableOutputLots();
    const found = lots.subproducto.find((l) => l.id === lot.id);
    expect(found?.sackCount).toBe(3);
    expect(found?.sacks.every((s) => s.fromStock)).toBe(true);
  });

  it("también admite mezclar sacas sueltas del tipo con sacas de almacén", async () => {
    const [stock] = await stockSacks(1);
    const loose = await prisma.sack.create({
      data: {
        qrCode: "SACK-LOOSE-1",
        status: SackStatus.RECHAZO,
        weight: 100,
        materialId: base.materialId,
      },
    });
    const lot = await createManualLot(LotType.RECHAZO, [loose.id, stock]);
    expect(lot.sackCount).toBe(2);
    const reloaded = await prisma.sack.findMany({
      where: { id: { in: [loose.id, stock] } },
      orderBy: { qrCode: "asc" },
    });
    // Solo la que venía de almacén queda marcada.
    expect(reloaded.filter((s) => s.fromStock)).toHaveLength(1);
  });

  it("rechaza sacas de otro material, en producción o ya en un lote", async () => {
    const otro = await prisma.material.create({
      data: { name: "Otro", code: "OTRO-L", type: "PELLET_PE" },
    });
    const [a] = await stockSacks(1);
    const [b] = await stockSacks(1, base.zoneAId, otro.id);
    await expect(createManualLot(LotType.RECHAZO, [a, b])).rejects.toThrow(
      /mismo material/,
    );

    const enProduccion = await prisma.sack.create({
      data: {
        qrCode: "SACK-PROD-1",
        status: SackStatus.EN_PRODUCCION,
        weight: 100,
        materialId: base.materialId,
      },
    });
    await expect(
      createManualLot(LotType.RECHAZO, [enProduccion.id]),
    ).rejects.toThrow(/almacén/);

    await createManualLot(LotType.RECHAZO, [a]);
    await expect(createManualLot(LotType.RECHAZO, [a])).rejects.toThrow();
  });

  it("no cuenta como producción y se puede expedir en un envío", async () => {
    const ids = await stockSacks(2);
    const lot = await createManualLot(LotType.PRODUCTO_TERMINADO, ids);

    const counts = await getOutputCounts();
    expect(counts.PRODUCTO_TERMINADO).toBe(0);
    expect((await getProductionStats()).ptToday).toBe(0);

    const shipment = await createShipment({
      buyerId: base.buyerId,
      lots: [{ lotId: lot.id, weightKg: 1000 }],
    });
    await confirmShipment(shipment.id);
    await expediteShipment(shipment.id);
    const sacks = await prisma.sack.findMany({ where: { id: { in: ids } } });
    expect(sacks.every((s) => s.status === SackStatus.EN_TRANSITO)).toBe(true);
  });

  it("al sacar del lote una saca de almacén hay que indicar la zona y vuelve a almacén", async () => {
    const [id] = await stockSacks(2).then((a) => [a[0], a[1]]);
    const lot = await createManualLot(LotType.SUBPRODUCTO, [id]);

    await expect(removeSackFromLot(id)).rejects.toThrow(/indica a qué/);

    await removeSackFromLot(id, base.zoneCId);
    const back = await prisma.sack.findUniqueOrThrow({ where: { id } });
    expect(back.status).toBe(SackStatus.EN_ALMACEN);
    expect(back.zoneId).toBe(base.zoneCId);
    expect(back.lotId).toBeNull();
    expect(back.fromStock).toBe(false);
    // El lote se quedó sin sacas y se eliminó.
    expect(
      await prisma.productionLot.findUnique({ where: { id: lot.id } }),
    ).toBeNull();
  });

  it("no devuelve la saca a una zona llena", async () => {
    const [id] = await stockSacks(1);
    await createManualLot(LotType.SUBPRODUCTO, [id]);
    await prisma.zone.update({
      where: { id: base.zoneCId },
      data: { maxCapacity: 1 },
    });
    await stockSacks(1, base.zoneCId);
    await expect(removeSackFromLot(id, base.zoneCId)).rejects.toThrow(
      /capacidad máxima/,
    );
    // Sigue en el lote.
    const still = await prisma.sack.findUniqueOrThrow({ where: { id } });
    expect(still.status).toBe(SackStatus.SUBPRODUCTO);
  });

  it("una saca suelta de producción sale del lote como siempre, sin pedir zona", async () => {
    const pt = await createPtLot(base.materialId, 2);
    await removeSackFromLot(pt.sackIds[0]);
    const s = await prisma.sack.findUniqueOrThrow({
      where: { id: pt.sackIds[0] },
    });
    expect(s.status).toBe(SackStatus.PRODUCTO_TERMINADO);
    expect(s.lotId).toBeNull();
  });

  it("lista los materiales con sacas en almacén y sus sacas filtradas", async () => {
    const otro = await prisma.material.create({
      data: { name: "Otro", code: "OTRO-S", type: "PELLET_PE" },
    });
    await stockSacks(3);
    await stockSacks(2, base.zoneCId, otro.id);

    const materials = await listStockMaterialsForLots();
    expect(materials.find((m) => m.id === base.materialId)?.count).toBe(3);
    expect(materials.find((m) => m.id === otro.id)?.count).toBe(2);

    const all = await listStockSacksForLot({ materialId: base.materialId });
    expect(all.total).toBe(3);
    const inC = await listStockSacksForLot({
      materialId: otro.id,
      zoneId: base.zoneCId,
    });
    expect(inC.items).toHaveLength(2);
    const none = await listStockSacksForLot({
      materialId: base.materialId,
      zoneId: base.zoneCId,
    });
    expect(none.total).toBe(0);
  });
});
